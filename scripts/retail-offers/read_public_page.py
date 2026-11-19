"""Bounded public HTML reader. TLS verification is always enabled."""
from urllib.request import Request,urlopen
from urllib.parse import urlparse
import sys
url=sys.argv[1]
if urlparse(url).scheme!='https':raise ValueError('HTTPS required')
with urlopen(Request(url,headers={
    'User-Agent':'NWv7-RetailOffers/1.0 (public offer preview)',
    'Accept':'text/html, application/json;q=0.9',
}),timeout=12) as response:
    host=urlparse(response.url).hostname or ''
    if host!='luluhypermarket.com' and not host.endswith('.luluhypermarket.com'):
        raise ValueError('Unexpected retailer redirect')
    body=response.read(3000001)
    if len(body)>3000000:raise ValueError('Body limit exceeded')
sys.stdout.buffer.write(body)
