import React, { useState } from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import './NewspaperCard.css';

const NewspaperCard = ({ article, sourceName, isTranslated, previewLines = 3 }) => {
    const [expanded, setExpanded] = useState(false);
    const displayTitle = isTranslated && article.title_en ? article.title_en : article.title;
    const displayPreview = isTranslated && article.preview_en ? article.preview_en : article.preview;
    const originalLanguagePreview = isTranslated && displayPreview && !article.preview_en;
    const lines = [2, 3, 4].includes(Number(previewLines)) ? Number(previewLines) : 3;
    const publishedDate = article.publishedAt ? new Date(article.publishedAt) : null;
    const validDate = publishedDate && !Number.isNaN(publishedDate.getTime());

    return (
        <article className="newspaper-card">
            {sourceName && <div className="newspaper-card__source">{sourceName}</div>}

            <h3 className="newspaper-card__title">
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                    {displayTitle}
                </a>
            </h3>

            {displayPreview && (
                <div className="newspaper-card__excerpt" style={{ '--preview-lines': lines }}>
                    <span className="newspaper-card__excerpt-label">
                        {originalLanguagePreview ? 'Publisher RSS excerpt (original language)' : 'Publisher RSS excerpt'}
                    </span>
                    <p className={`newspaper-card__preview ${expanded ? 'newspaper-card__preview--expanded' : ''}`}>{displayPreview}</p>
                    <button
                        type="button"
                        className="newspaper-card__preview-toggle"
                        aria-expanded={expanded}
                        onClick={() => setExpanded(value => !value)}
                    >
                        {expanded ? 'Show less' : 'Show entire excerpt'}
                    </button>
                </div>
            )}

            {validDate && <time dateTime={publishedDate.toISOString()} className="newspaper-card__time">
                {publishedDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </time>}
            <div className="newspaper-card__footer">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="newspaper-card__link">
                    Read Full Story <FaExternalLinkAlt size={10} />
                </a>
            </div>
        </article>
    );
};

export default NewspaperCard;
