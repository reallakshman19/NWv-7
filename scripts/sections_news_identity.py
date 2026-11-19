"""Section news HTTP(S) identity. Mirrors newsStoryIdentity.js without network I/O."""
import hashlib
from ipaddress import IPv6Address
import re
from urllib.parse import parse_qsl, quote, quote_plus, urlencode, urlsplit, urlunsplit

TRACKING = {'utm', 'at_campaign', 'at_medium', 'cmpid', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'}
AUTHORITY = re.compile(r'^https?://([^/?#]+)', flags=re.ASCII | re.I)
DNS_LABEL = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$', flags=re.ASCII | re.I)
UNRESERVED = re.compile(r'^[a-z0-9._~-]$', flags=re.ASCII | re.I)
PATH_TOKEN = re.compile(r"%[0-9a-f]{2}|[^a-z0-9._~!$&'()*+,;=:@/-]", flags=re.ASCII | re.I)
# ECMAScript String.trim's whitespace and line terminators.
URL_TRIM = '\t\n\v\f\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def _is_dns_label(label):
    if not DNS_LABEL.fullmatch(label):
        return False
    if not label.startswith('xn--'):
        return True
    # urlsplit leaves A-labels untouched. Reject malformed Punycode and labels
    # that decode to controls or whitespace before accepting a redirect target.
    decoded = label[4:].encode('ascii').decode('punycode')
    return not any(character.isspace() or 0x7f <= ord(character) <= 0x9f for character in decoded)


def _http_url(value):
    raw = str(value or '').strip(URL_TRIM)
    authority = AUTHORITY.match(raw)
    if not authority or re.search(r'[^\x21-\x7e]|@', authority[1]) or re.search(r'[\x00-\x1f\x7f\\]', raw):
        return None
    parts = urlsplit(raw)
    host = parts.hostname
    if authority[1].startswith('['):
        if not re.fullmatch(r'\[[0-9a-f:.]+\](?::[0-9]*)?', authority[1], re.I):
            return None
        address = IPv6Address(host)
        compressed = address.compressed
        if address.ipv4_mapped:
            # WHATWG serializes an IPv4-mapped address as hexadecimal.
            high, low = divmod(int(address.ipv4_mapped), 1 << 16)
            compressed = f'::ffff:{high:x}:{low:x}'
        host = '[' + compressed + ']'
    else:
        if not re.fullmatch(r'[^:]+(?::[0-9]*)?', authority[1]):
            return None
        host = host.removesuffix('.')
        labels = host.split('.')
        if not all(_is_dns_label(label) for label in labels):
            return None
        if re.fullmatch(r'(?:[0-9]+|0x[0-9a-f]*)', labels[-1], re.I):
            if len(labels) != 4 or not all(re.fullmatch(r'(?:0|[1-9][0-9]{0,2})', label) and int(label) <= 255 for label in labels):
                return None
        host = host.removeprefix('www.')
    port = parts.port
    netloc = host if port is None or (parts.scheme, port) in (('http', 80), ('https', 443)) else f'{host}:{port}'
    return parts, host, netloc


def _path_token(match):
    token = match[0]
    if re.fullmatch(r'%[0-9a-f]{2}', token, re.I):
        decoded = chr(int(token[1:], 16))
        return decoded if UNRESERVED.fullmatch(decoded) else token.upper()
    return quote(token, safe='')


def _canonical_path(path):
    path = PATH_TOKEN.sub(_path_token, path or '/')
    segments = path.split('/')
    stack = []
    for index, segment in enumerate(segments):
        if segment in ('.', '..'):
            if segment == '..' and len(stack) > 1:
                stack.pop()
            if index == len(segments) - 1:
                stack.append('')
        else:
            stack.append(segment)
    normalized = re.sub(r'(?:/amp)+/?$', '', '/'.join(stack), flags=re.ASCII | re.I)
    normalized = re.sub(r'(?:/amp)+/', '/', normalized)
    return re.sub(r'([^/])/$', r'\1', normalized) or '/'


def _form_quote(value, safe='', encoding=None, errors=None):
    # URLSearchParams uses * as an unescaped form byte, and escapes ~.
    return quote_plus(value, safe=safe + '*', encoding=encoding, errors=errors).replace('~', '%7E')


def _canonical_url(value, unwrap_redirect):
    parsed = _http_url(value)
    if parsed is None:
        return ''
    parts, host, netloc = parsed
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    if unwrap_redirect and host == 'news.google.com':
        target = next((v for key, v in pairs if key == 'url'), '')
        try:
            nested = _http_url(target)
            if nested and nested[1] != host:
                return _canonical_url(target, False)
        except (ValueError, UnicodeError):
            pass  # Keep the wrapper when it supplies a malformed target.
    pairs = [
        (key, val) for key, val in pairs
        if not (key.lower().startswith('utm_') or key.lower() in TRACKING or
                (host == 'news.google.com' and key.lower() == 'oc'))
    ]
    pairs.sort(key=lambda pair: pair[0].encode('utf-16-be'))
    return urlunsplit((parts.scheme, netloc, _canonical_path(parts.path), urlencode(pairs, quote_via=_form_quote), ''))


def canonical_news_url(value):
    try:
        return _canonical_url(value, True)
    except (TypeError, ValueError, UnicodeError):
        return ''


def section_story_id(item):
    canonical = canonical_news_url(item.get('url'))
    return hashlib.sha1(canonical.encode('utf-8')).hexdigest()[:16] if canonical else item.get('id')
