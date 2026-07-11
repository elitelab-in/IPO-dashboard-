document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/articles')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('articles-container');
            if (!container) return;
            
            if (!data.articles || data.articles.length === 0) {
                container.innerHTML = '<p style="color:var(--text-secondary); grid-column: 1 / -1; text-align:center; padding: 3rem;">No articles published yet.</p>';
                return;
            }
            
            let html = '';
            data.articles.forEach(article => {
                const dateObj = new Date(article.created_at.replace(' ', 'T'));
                const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                
                const img = article.image_url ? article.image_url : '/assets/images/article_placeholder.png';
                
                html += \
                <a href="/article?slug=\" class="article-card">
                    <img src="\" alt="\" class="article-img">
                    <div class="article-content">
                        <span class="article-category">\</span>
                        <h3 class="article-title">\</h3>
                        <div class="article-meta">
                            <span>\</span>
                            <span><i class="fa-regular fa-clock"></i> \ min read</span>
                        </div>
                    </div>
                </a>
                \;
            });
            container.innerHTML = html;
        })
        .catch(err => console.error('Failed to load articles:', err));
});
