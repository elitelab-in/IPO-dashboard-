document.addEventListener('DOMContentLoaded', () => {
    const newsContainer = document.getElementById('news-container');
    const loadingState = document.getElementById('loading-state');

    // Make sure we are on the news page
    if (!newsContainer) return;

    const fetchNews = async () => {
        try {
            const response = await fetch('/api/news');
            const result = await response.json();

            if (result.data && result.data.length > 0) {
                renderNews(result.data);
            } else {
                showError("No news found at the moment.");
            }
        } catch (error) {
            console.error("Error fetching news:", error);
            showError("Failed to load Indian market news. Please try again later.");
        } finally {
            if (loadingState) {
                loadingState.style.display = 'none';
            }
        }
    };

    const renderNews = (articles) => {
        newsContainer.innerHTML = '';
        newsContainer.style.display = 'grid';

        articles.forEach(article => {
            const dateStr = new Date(article.pubDate).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const card = document.createElement('a');
            card.className = 'news-card glass-panel';
            card.href = article.link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const imageHtml = article.image ? `<div class="news-image"><img src="${article.image}" alt="${article.title}"></div>` : '';

            card.innerHTML = `
                ${imageHtml}
                <div class="news-content-wrapper">
                    <div class="news-meta">
                        <span class="news-source"><i class="fa-solid fa-newspaper"></i> The Economic Times</span>
                        <span class="news-date">${dateStr}</span>
                    </div>
                    <h3 class="news-title">${article.title}</h3>
                    <p class="news-desc">${article.description}</p>
                    <div class="news-footer">
                        <span class="read-more">Read Full Story <i class="fa-solid fa-arrow-right"></i></span>
                    </div>
                </div>
            `;

            newsContainer.appendChild(card);
        });
    };

    const showError = (msg) => {
        newsContainer.style.display = 'block';
        newsContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--danger); font-size: 1.1rem;" class="glass-panel">
                ${msg}
            </div>
        `;
    };

    // Initial fetch
    fetchNews();
});
