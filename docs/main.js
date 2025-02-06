/**
 * main.js
 * Provides interactive features such as a back-to-top button.
 */
(function () {
  'use strict';

  const backToTopButton = document.getElementById('backToTop');

  // Toggle back-to-top button visibility on scroll
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      backToTopButton.style.display = 'block';
    } else {
      backToTopButton.style.display = 'none';
    }
  });

  // Smooth scroll to top on button click
  backToTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
