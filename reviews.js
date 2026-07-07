const reviewsData = [
    {
        id: 1,
        initials: "HEX",
        logo: "logo_hexaware.png",
        name: "Hexaware",
        metric: "₹4,729",
        strategy: "SWING TRADE",
        screenshot: "review1.jpg"
    },
    {
        id: 2,
        initials: "SUZ",
        logo: "logo_suzlon.png",
        name: "Suzlon",
        metric: "₹6,795",
        strategy: "BREAKOUT",
        screenshot: "review2.jpg"
    },
    {
        id: 3,
        initials: "ANR",
        logo: "logo_anantraj.png",
        name: "Anant Raj",
        metric: "₹7,409",
        strategy: "IPO BASE",
        screenshot: "review3.jpg"
    },
    {
        id: 4,
        initials: "RED",
        logo: "logo_redtape.png",
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
    }, 2500); // 2.5 seconds total interval
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
    document.getElementById('review-metric').textContent = review.metric + ' Profit';
}
