document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    
    if (!slug) {
        document.getElementById('article-main-content').innerHTML = '<h2>Article not found</h2>';
        return;
    }
    
    fetch('/api/articles/' + slug)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                document.getElementById('article-main-content').innerHTML = '<h2>Article not found</h2>';
                return;
            }
            
            const article = data.article;
            const dateObj = new Date(article.created_at.replace(' ', 'T'));
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            
            document.title = article.title + ' - Elitelab';
            document.getElementById('article-title').innerText = article.title;
            document.getElementById('article-category').innerText = article.category;
            document.getElementById('article-date').innerText = dateStr;
            document.getElementById('article-readtime').innerText = article.read_time_minutes + ' min read';
            
            if (article.image_url) {
                document.getElementById('article-hero-img').src = article.image_url;
            }
            
            document.getElementById('article-content').innerHTML = article.content;
            
            // Also update the breadcrumb
            document.getElementById('breadcrumb-title').innerText = article.title;
        })
        .catch(err => {
            console.error(err);
            document.getElementById('article-main-content').innerHTML = '<h2>Error loading article</h2>';
        });
});
