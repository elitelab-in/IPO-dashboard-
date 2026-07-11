document.addEventListener('DOMContentLoaded', () => {
    // Check if user is admin before allowing them to see the page
    fetch('/api/auth/status')
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in || data.user.is_admin !== 1) {
                document.body.innerHTML = '<div style="text-align:center; margin-top:20vh; color:white;"><h1>Unauthorized</h1><p>You must be an administrator to access the Author Dashboard.</p><a href="/" style="color:#8B5CF6;">Return Home</a></div>';
            }
        })
        .catch(err => {
            window.location.href = '/login';
        });

    const form = document.getElementById('author-form');
    const errBox = document.getElementById('author-error');
    const succBox = document.getElementById('author-success');
    const btn = document.getElementById('btn-publish');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        succBox.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';

        const title = document.getElementById('article-title').value.trim();
        const category = document.getElementById('article-category').value;
        const readTime = parseInt(document.getElementById('article-readtime').value);
        const imageUrl = document.getElementById('article-image').value.trim();
        const content = document.getElementById('article-content').value.trim();

        fetch('/api/articles/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                category: category,
                read_time_minutes: readTime,
                image_url: imageUrl,
                content: content
            })
        })
        .then(res => res.json().then(data => ({status: res.status, body: data})))
        .then(res => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Article';
            if (res.status === 201) {
                succBox.innerText = 'Article published successfully! You can view it on the Articles page.';
                succBox.style.display = 'block';
                form.reset();
            } else {
                errBox.innerText = res.body.message || 'Failed to publish article.';
                errBox.style.display = 'block';
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Article';
            errBox.innerText = 'Network error occurred.';
            errBox.style.display = 'block';
        });
    });
});
