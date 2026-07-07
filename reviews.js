const reviewsData = [
    {
        id: 1,
        initials: "HEX",
        logo: "https://assets.smallcase.com/images/smallplaces/200/HEXAWARE.png",
        logoFallback: "https://storage.googleapis.com/kite-app-assets-public/kite-app/1.54.0/static/media/HEXAWARE.svg",
        name: "Hexaware",
        metric: "₹4,729",
        strategy: "SWING TRADE",
        screenshot: "review1.jpg"
    },
    {
        id: 2,
        initials: "SUZ",
        logo: "https://assets.smallcase.com/images/smallplaces/200/SUZLON.png",
        name: "Suzlon",
        metric: "₹6,795",
        strategy: "BREAKOUT",
        screenshot: "review2.jpg"
    },
    {
        id: 3,
        initials: "ANR",
        logo: "https://assets.smallcase.com/images/smallplaces/200/ANANTRAJ.png",
        name: "Anant Raj",
        metric: "₹7,409",
        strategy: "IPO BASE",
        screenshot: "review3.jpg"
    },
    {
        id: 4,
        initials: "RED",
        logo: "https://assets.smallcase.com/images/smallplaces/200/REDTAPE.png",
        name: "Redtape",
        metric: "₹8,793",
        strategy: "MOMENTUM",
        screenshot: "review4.jpg"
    }
];

let currentIndex = 0;
let autoInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    const pillsContainer = document.getElementById('reviewer-pills');
    const mainCard = document.getElementById('main-review-card');

    // Build pills
    reviewsData.forEach((review, index) => {
        const pill = document.createElement('div');
        pill.className = `reviewer-pill ${index === 0 ? 'active' : ''}`;
        pill.dataset.index = index;

        let avatarHTML = review.logo
            ? `<img src="${review.logo}" alt="${review.name}" onerror="this.parentElement.innerHTML='${review.initials}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : review.initials;

        pill.innerHTML = `
            <div class="pill-avatar">${avatarHTML}</div>
            <div class="pill-info">
                <span class="pill-name">${review.name}</span>
                <span class="pill-metric" style="color: #10B981; font-weight: 700;">${review.metric} Profit</span>
            </div>
        `;

        pill.addEventListener('click', () => {
            // On manual click, reset timer
            clearInterval(autoInterval);
            currentIndex = index;
            switchToReview(currentIndex);
            startAutoPlay();
        });

        pillsContainer.appendChild(pill);
    });

    // Start auto-play
    startAutoPlay();
});

function startAutoPlay() {
    autoInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % reviewsData.length;
        switchToReview(currentIndex);
    }, 1500); // 1 second visible + 300ms fade + 200ms buffer = 1.5s total
}

function switchToReview(index) {
    const mainCard = document.getElementById('main-review-card');
    const pills = document.querySelectorAll('.reviewer-pill');

    // Update active pill
    pills.forEach(p => p.classList.remove('active'));
    if (pills[index]) pills[index].classList.add('active');

    // Fade out → update → fade in
    mainCard.classList.add('fade-out');
    setTimeout(() => {
        updateMainCard(reviewsData[index]);
        mainCard.classList.remove('fade-out');
    }, 300);
}

function updateMainCard(review) {
    document.getElementById('review-screenshot').src = review.screenshot;
    document.getElementById('review-name').textContent = review.name + ' Trade';
    document.getElementById('review-strategy').textContent = `Strategy: ${review.strategy}`;
    document.getElementById('review-metric').textContent = review.metric + ' Profit';

    const avatarLarge = document.getElementById('review-avatar-large');
    avatarLarge.innerHTML = review.logo
        ? `<img src="${review.logo}" alt="${review.name}" onerror="this.textContent='${review.initials}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : review.initials;
}
