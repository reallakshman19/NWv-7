import React from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import './NewspaperCard.css';

const NewspaperCard = ({ article, sourceName, isTranslated, previewLines = 3 }) => {
    const displayTitle = isTranslated && article.title_en ? article.title_en : article.title;
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

            {article.preview && (
                <div className="newspaper-card__excerpt" style={{ '--preview-lines': lines }}>
                    <span className="newspaper-card__excerpt-label">Publisher RSS excerpt</span>
                    <p className="newspaper-card__preview">{article.preview}</p>
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
