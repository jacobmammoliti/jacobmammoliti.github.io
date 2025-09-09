// Lightbox functionality for blog images
document.addEventListener('DOMContentLoaded', function() {
    // Create lightbox element
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
        <span class="lightbox-close">&times;</span>
        <img class="lightbox-content" alt="">
    `;
    document.body.appendChild(lightbox);

    const lightboxImg = lightbox.querySelector('.lightbox-content');
    const closeBtn = lightbox.querySelector('.lightbox-close');

    // Function to open lightbox
    function openLightbox(src, alt) {
        lightboxImg.src = src;
        lightboxImg.alt = alt || '';
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }

    // Function to close lightbox
    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }

    // Add click event to all images in post content
    const postImages = document.querySelectorAll('.post-body img, .article-content img');
    postImages.forEach(img => {
        // Skip if image is inside a link or is very small (likely icons)
        if (img.closest('a') || img.width < 100 || img.height < 100) {
            return;
        }

        img.addEventListener('click', function(e) {
            e.preventDefault();
            openLightbox(this.src, this.alt);
        });

        // Add visual indicator that image is clickable
        img.style.cursor = 'pointer';
        img.title = 'Click to expand';
    });

    // Close lightbox when clicking on close button
    closeBtn.addEventListener('click', closeLightbox);

    // Close lightbox when clicking outside the image
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    // Close lightbox with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });

    // Prevent right-click context menu on lightbox image
    lightboxImg.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
});
