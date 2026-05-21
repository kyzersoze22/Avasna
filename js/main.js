/* ============================================================
   AVASNA — Animation Engine v7 (Award-Winning Overhaul)
   Custom cursor, immersive transitions, clip-path reveals,
   cinematic hero, horizontal scroll services
   ============================================================ */

function initAvasna() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouchDevice = window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  // ================================================================
  // 1. LENIS SMOOTH SCROLL
  // ================================================================
  let lenis;
  if (typeof Lenis !== 'undefined' && !prefersReduced) {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    document.querySelectorAll('a[href*="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        let hash;
        if (href.startsWith('#')) hash = href;
        else if (href.startsWith('/#') && window.location.pathname === '/') hash = href.substring(1);
        else return;
        const target = document.querySelector(hash);
        if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -80, duration: 1.2 }); }
      });
    });
  }

  // ================================================================
  // 2. CUSTOM CURSOR
  // ================================================================
  if (!isTouchDevice && !prefersReduced) {
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');
    const followerText = document.querySelector('.cursor-follower__text');

    if (cursor && follower) {
      let mouseX = -100, mouseY = -100;
      const cursorMove = gsap.quickTo(cursor, 'left', { duration: 0.1, ease: 'power2.out' });
      const cursorMoveY = gsap.quickTo(cursor, 'top', { duration: 0.1, ease: 'power2.out' });
      const followerMoveX = gsap.quickTo(follower, 'left', { duration: 0.35, ease: 'power2.out' });
      const followerMoveY = gsap.quickTo(follower, 'top', { duration: 0.35, ease: 'power2.out' });

      window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursorMove(mouseX);
        cursorMoveY(mouseY);
        followerMoveX(mouseX);
        followerMoveY(mouseY);
      }, { passive: true });

      // Hover targets — project cards, gallery items
      const hoverTargets = document.querySelectorAll(
        '.project-card, .works-gallery__item, .project-nav-full'
      );
      hoverTargets.forEach(el => {
        el.addEventListener('mouseenter', () => {
          document.body.classList.add('cursor--hover');
          if (followerText) followerText.textContent = 'View';
        });
        el.addEventListener('mouseleave', () => {
          document.body.classList.remove('cursor--hover');
        });
      });

      // Drag targets — carousel
      const dragTargets = document.querySelectorAll('.carousel-track');
      dragTargets.forEach(el => {
        el.addEventListener('mouseenter', () => {
          document.body.classList.add('cursor--drag');
          if (followerText) followerText.textContent = 'Drag';
        });
        el.addEventListener('mouseleave', () => {
          document.body.classList.remove('cursor--drag');
        });
      });

      // Hide cursor when leaving window
      document.addEventListener('mouseleave', () => {
        gsap.to([cursor, follower], { opacity: 0, duration: 0.3 });
      });
      document.addEventListener('mouseenter', () => {
        gsap.to([cursor, follower], { opacity: 1, duration: 0.3 });
      });
    }
  }

  // ================================================================
  // 3. SCROLL PROGRESS BAR
  // ================================================================
  const progressBar = document.querySelector('.scroll-progress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
      progressBar.style.width = Math.min(pct, 100) + '%';
    }, { passive: true });
  }

  // ================================================================
  // 4. PAGE TRANSITION — Single Panel Wipe (original)
  // ================================================================
  const overlay = document.querySelector('.page-transition');
  const zoomOverlay = document.querySelector('.project-zoom-overlay');
  
  // Check if we arrived here via a project zoom transition
  const isZoomTransition = sessionStorage.getItem('zoomTransition') === 'true';
  if (isZoomTransition) {
    sessionStorage.removeItem('zoomTransition');
    // Bypass the black panel completely for a seamless handoff
    if (overlay) gsap.set(overlay, { display: 'none' });
    // Note: The text fade-up is automatically handled by the global Project Hero Text animation below.
  } else if (overlay) {
    // Normal Entry: panel retracts (page revealed)
    gsap.set(overlay, { scaleY: 1, transformOrigin: 'top' });
    gsap.to(overlay, { scaleY: 0, duration: 0.5, ease: 'power3.inOut' });
  }

  if (overlay) {
    // Click handler for navigation links
    if (!prefersReduced) {
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') ||
            link.getAttribute('target') === '_blank') return;
        if (href.startsWith('/#') && window.location.pathname === '/') return;

        // Check if this is a project card click (immersive zoom)
        const projectCard = link.closest('.project-card, .works-gallery__item, .project-nav-full');
        if (projectCard && zoomOverlay) {
          e.preventDefault();
          const img = projectCard.querySelector('img');
          if (img) {
            doProjectZoom(img, projectCard, href);
            return;

          }
        }

        e.preventDefault();
        const pf = document.createElement('link'); pf.rel = 'prefetch'; pf.href = href; document.head.appendChild(pf);

        // Exit: panel expands bottom-to-top
        overlay.style.transformOrigin = 'bottom';
        gsap.to(overlay, {
          scaleY: 1, duration: 0.35, ease: 'power3.inOut',
          onComplete: () => { window.location.href = href; }
        });
      });
    }
  }

  // ================================================================
  // 5. IMMERSIVE PROJECT ZOOM TRANSITION
  //    - Prefetches destination page immediately on click
  //    - Animates the card image to fill viewport using GPU transforms
  //    - Fades in a dark scrim, then navigates
  // ================================================================
  function doProjectZoom(imgEl, cardEl, href) {
    // Start prefetching the destination page immediately
    const prefetchLink = document.createElement('link');
    prefetchLink.rel = 'prefetch';
    prefetchLink.href = href;
    document.head.appendChild(prefetchLink);

    const fetchPromise = fetch(href, { priority: 'high' }).catch(() => {});

    const zoomImg = zoomOverlay.querySelector('.project-zoom-overlay__img');
    const scrim = zoomOverlay.querySelector('.project-zoom-overlay__scrim');
    if (!zoomImg) return;

    const rect = cardEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Calculate clip-path inset distances
    const insetTop = rect.top;
    const insetRight = vw - rect.right;
    const insetBottom = vh - rect.bottom;
    const insetLeft = rect.left;

    zoomImg.src = imgEl.src;
    
    // Set to full screen but clip it to match the exact card position
    gsap.set(zoomImg, {
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      objectFit: 'cover',
      clipPath: `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px)`,
      scale: 1.1, // Slight scale up for parallax depth effect
      transformOrigin: 'center center'
    });
    gsap.set(scrim, { opacity: 0 });

    zoomOverlay.classList.add('active');
    cardEl.style.visibility = 'hidden';

    const tl = gsap.timeline();

    // Animate clip-path to 0 (full screen reveal) and scale to 1 (parallax settle)
    tl.to(zoomImg, {
      clipPath: 'inset(0px 0px 0px 0px)',
      scale: 1,
      duration: 1.0,
      ease: 'expo.inOut' // Very premium, award-winning easing curve
    });

    // Scrim fade in to match destination hero shadow
    tl.to(scrim, {
      opacity: 0.6,
      duration: 0.4,
      ease: 'power2.inOut'
    }, '-=0.4');

    // Navigate
    tl.add(() => {
      fetchPromise.finally(() => {
        sessionStorage.setItem('zoomTransition', 'true');
        window.location.href = href;
      });
    });
  }

  // ================================================================
  // 6. SCROLL INDICATOR (inject into hero)
  // ================================================================
  const hero = document.querySelector('.hero, .project-hero');
  if (hero && !document.querySelector('.scroll-indicator')) {
    const indicator = document.createElement('div');
    indicator.className = 'scroll-indicator';
    indicator.innerHTML = '<span>Scroll</span>';
    hero.style.position = 'relative';
    hero.appendChild(indicator);
  }

  // ================================================================
  // 7. HERO — Cinematic Text Reveal
  // ================================================================
  if (!prefersReduced) {
    const heroTitle = document.querySelector('.hero__title');
    const heroSubtitle = document.querySelector('.hero__subtitle');
    const heroLine = document.querySelector('.hero__line');

    if (heroTitle) {
      const tl = gsap.timeline({ delay: 0.5 });
      tl.to(heroTitle, {
        clipPath: 'inset(0 0 0% 0)',
        duration: 1.2,
        ease: 'power3.inOut'
      });
      if (heroSubtitle) {
        tl.to(heroSubtitle, {
          opacity: 1, y: 0, duration: 0.8, ease: 'power2.out'
        }, '-=0.4');
      }
      if (heroLine) {
        tl.to(heroLine, {
          scaleX: 1, duration: 0.8, ease: 'power2.out'
        }, '-=0.4');
      }
    }

    // Hero parallax
    if (hero) {
      const img = hero.querySelector('.hero__bg img, .project-hero__bg img');
      if (img) {
        gsap.to(img, {
          yPercent: 12, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 }
        });
      }
    }
  }

  // ================================================================
  // 8. INTRO — Word Stagger Reveal
  // ================================================================
  if (!prefersReduced) {
    const introWords = document.querySelectorAll('.intro__heading .word');
    if (introWords.length > 1) {
      gsap.set(introWords, { yPercent: 100, autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: '.intro__heading',
        start: 'top 80%',
        onEnter: () => {
          gsap.to(introWords, {
            yPercent: 0, autoAlpha: 1,
            stagger: 0.03, duration: 0.7,
            ease: 'power3.out'
          });
        },
        once: true
      });
    }

    // Intro button slide up
    const introBtn = document.querySelector('.intro__btn');
    if (introBtn) {
      gsap.set(introBtn, { y: 30, opacity: 0 });
      ScrollTrigger.create({
        trigger: introBtn,
        start: 'top 90%',
        onEnter: () => {
          gsap.to(introBtn, { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out', delay: 0.3 });
        },
        once: true
      });
    }
  }

  // ================================================================
  // 9. PROJECT CARDS — Clip-Path Reveal + Tilt
  // ================================================================
  if (!prefersReduced) {
    const cards = gsap.utils.toArray('.project-card');
    cards.forEach((card, i) => {
      gsap.set(card, { clipPath: 'inset(100% 0 0 0)' });
      gsap.to(card, {
        clipPath: 'inset(0% 0 0 0)',
        duration: 1.2, ease: 'power3.inOut',
        scrollTrigger: {
          trigger: card, start: 'top 90%',
          toggleActions: 'play none none none'
        },
        delay: i % 2 === 0 ? 0 : 0.15
      });

      // Subtle magnetic tilt on hover
      if (!isTouchDevice) {
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          gsap.to(card, {
            rotateY: x * 4, rotateX: -y * 4,
            duration: 0.4, ease: 'power2.out',
            transformPerspective: 1000
          });
        });
        card.addEventListener('mouseleave', () => {
          gsap.to(card, {
            rotateY: 0, rotateX: 0,
            duration: 0.6, ease: 'power2.out'
          });
        });
      }
    });
  }

  // ================================================================
  // 10. IMAGE FADE REVEALS
  // ================================================================
  if (!prefersReduced) {
    document.querySelectorAll('.img-fade').forEach(el => {
      if (el.closest('.carousel-track')) return;
      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
            el.classList.add('visible');
            obs.unobserve(el);
          }
        }, { threshold: 0.15 });
        obs.observe(el);
      } else {
        el.classList.add('visible');
      }
    });
  }

  // ================================================================
  // 11. IMAGE PARALLAX — How We Work
  // ================================================================
  if (!prefersReduced) {
    document.querySelectorAll('.how-we-work__image-left img').forEach(img => {
      const parent = img.closest('.how-we-work__image-left');
      if (!parent) return;
      gsap.to(img, {
        yPercent: -6, ease: 'none',
        scrollTrigger: { trigger: parent, start: 'top bottom', end: 'bottom top', scrub: 2 }
      });
    });
  }

  // ================================================================
  // 12. SERVICES CAROUSEL
  // ================================================================
  const track = document.querySelector('.carousel-track');
  if (track) {
    const prevBtn = document.querySelector('.carousel-btn--prev');
    const nextBtn = document.querySelector('.carousel-btn--next');
    if (prevBtn && nextBtn) {
      const slides = track.querySelectorAll('.carousel-slide');
      const N = slides.length;
      let idx = 0, timer, isVisible = true;

      track.style.willChange = 'transform';
      track.style.transform = 'translateX(0px)';

      const slideWidth = () => {
        const first = slides[0];
        if (first) { const w = first.getBoundingClientRect().width; if (w > 0) return w; }
        return track.parentElement?.getBoundingClientRect().width || window.innerWidth;
      };

      const counter = document.querySelector('.slide-counter');
      const updateCounter = () => {
        if (counter) counter.textContent = `0${idx + 1} / 0${N}`;
      };
      updateCounter();

      const go = () => {
        track.style.transform = `translateX(${-(idx * (slideWidth() + 10))}px)`;
        updateCounter();
      };

      const advance = (dir) => {
        idx = (idx + dir + N) % N;
        go();
        resetTimer();
      };

      const resetTimer = () => {
        clearInterval(timer);
        if (isVisible) timer = setInterval(() => advance(1), 5500);
      };

      prevBtn.addEventListener('click', (e) => { e.preventDefault(); advance(-1); });
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); advance(1); });

      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(([entry]) => {
          isVisible = entry.isIntersecting;
          if (isVisible) resetTimer();
          else clearInterval(timer);
        }, { threshold: 0.1 });
        obs.observe(track.closest('section') || track);
      }

      resetTimer();

      let sx = 0;
      track.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
      track.addEventListener('touchend', (e) => {
        const d = sx - e.changedTouches[0].clientX;
        if (Math.abs(d) > 50) advance(d > 0 ? 1 : -1);
      });

      window.addEventListener('resize', go);
    }
  }

  // ================================================================
  // 13. NAVBAR — glassmorphism on scroll
  // ================================================================
  if (!prefersReduced) {
    const navbar = document.querySelector('#navbar');
    if (navbar) {
      ScrollTrigger.create({
        start: 'top -80',
        onUpdate: (self) => {
          if (self.scroll() > 80) {
            navbar.classList.add('scrolled');
          } else {
            navbar.classList.remove('scrolled');
          }
        }
      });
    }
  }

  // ================================================================
  // 14. QUOTE — scroll-driven word reveal with Y-translate
  // ================================================================
  if (!prefersReduced) {
    const quoteSection = document.querySelector('.quote');
    if (quoteSection) {
      const wordSpans = quoteSection.querySelectorAll('.word');
      if (wordSpans.length > 1) {
        wordSpans.forEach(span => {
          span.style.opacity = '0.12';
          span.style.transform = 'translateY(8px)';
          span.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        });

        ScrollTrigger.create({
          trigger: quoteSection,
          start: 'top 60%',
          end: 'bottom 40%',
          scrub: 0.5,
          onUpdate: (self) => {
            const progress = self.progress;
            wordSpans.forEach((span, i) => {
              const wp = (progress - (i / wordSpans.length)) * wordSpans.length;
              const val = Math.max(0, Math.min(1, wp * 2));
              span.style.opacity = Math.max(0.12, val);
              span.style.transform = `translateY(${(1 - val) * 8}px)`;
            });
          }
        });
      }
    }
  }

  // ================================================================
  // 15. GALLERY IMAGE REVEALS (project pages) — Clip cascade
  // ================================================================
  if (!prefersReduced) {
    const galleryItems = document.querySelectorAll('.project-gallery__item');
    galleryItems.forEach((item, i) => {
      const directions = ['inset(100% 0 0 0)', 'inset(0 100% 0 0)', 'inset(0 0 100% 0)', 'inset(0 0 0 100%)'];
      const startClip = directions[i % directions.length];
      gsap.set(item, { clipPath: startClip });
      gsap.to(item, {
        clipPath: 'inset(0 0 0 0)',
        duration: 1.2, ease: 'power3.inOut',
        scrollTrigger: {
          trigger: item, start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // ================================================================
  // 16. WORKS GALLERY — Stagger reveal
  // ================================================================
  if (!prefersReduced) {
    const worksItems = document.querySelectorAll('.works-gallery__item');
    worksItems.forEach((item, i) => {
      gsap.set(item, { clipPath: 'inset(100% 0 0 0)' });
      gsap.to(item, {
        clipPath: 'inset(0 0 0 0)',
        duration: 1, ease: 'power3.inOut',
        scrollTrigger: {
          trigger: item, start: 'top 90%',
          toggleActions: 'play none none none'
        },
        delay: i * 0.1
      });
    });
  }

  // ================================================================
  // 17. PROJECT HERO TEXT — Split animation
  // ================================================================
  if (!prefersReduced) {
    const projectTitle = document.querySelector('.project-hero__title');
    if (projectTitle) {
      gsap.fromTo(projectTitle, 
        { y: 60, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out', delay: 0.3 }
      );
    }
    const projectDesc = document.querySelector('.project-hero__desc');
    if (projectDesc) {
      gsap.fromTo(projectDesc, 
        { y: 40, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power2.out', delay: 0.6 }
      );
    }
    const projectTagline = document.querySelector('.project-highlights__tagline');
    if (projectTagline) {
      gsap.fromTo(projectTagline, 
        { y: 30, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: projectTagline, start: 'top 80%' }
        }
      );
    }
  }

  // ================================================================
  // 18. CTA BANNER — Parallax + Text Reveal
  // ================================================================
  if (!prefersReduced) {
    const ctaBanner = document.querySelector('.cta-banner');
    if (ctaBanner) {
      const ctaBg = ctaBanner.querySelector('.cta-banner__bg img');
      if (ctaBg) {
        gsap.to(ctaBg, {
          yPercent: 15, ease: 'none',
          scrollTrigger: { trigger: ctaBanner, start: 'top bottom', end: 'bottom top', scrub: 1.5 }
        });
      }
      const ctaContent = ctaBanner.querySelector('.cta-banner__content');
      if (ctaContent) {
        gsap.fromTo(ctaContent, 
          { y: 40, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power2.out',
            scrollTrigger: { trigger: ctaBanner, start: 'top 70%' }
          }
        );
      }
    }
  }

  // ================================================================
  // 19. TEAM MEMBERS — Stagger fade-in
  // ================================================================
  if (!prefersReduced) {
    const teamMembers = document.querySelectorAll('.team-member');
    teamMembers.forEach((member, i) => {
      gsap.fromTo(member, 
        { y: 40, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power2.out',
          delay: i * 0.1,
          scrollTrigger: { trigger: member, start: 'top 85%' }
        }
      );
    });
  }

  // ================================================================
  // 20. SECTION DIVIDER — Line reveal
  // ================================================================
  if (!prefersReduced) {
    document.querySelectorAll('.section-divider__line').forEach(line => {
      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
            line.classList.add('visible');
            obs.unobserve(line);
          }
        }, { threshold: 0.5 });
        obs.observe(line);
      }
    });
  }

  // ================================================================
  // 21. FOOTER — Back to top
  // ================================================================
  const backToTop = document.querySelector('.footer__back-to-top');
  if (backToTop) {
    backToTop.addEventListener('click', () => {
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.5 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // ================================================================
  // 22. CONTACT FORM — Input focus animation
  // ================================================================
  document.querySelectorAll('.contact-form__input, .contact-form__textarea').forEach(input => {
    const label = input.previousElementSibling;
    if (label && label.classList.contains('contact-form__label')) {
      input.addEventListener('focus', () => {
        gsap.to(label, { y: -4, scale: 0.9, color: '#A0845C', duration: 0.3, ease: 'power2.out' });
      });
      input.addEventListener('blur', () => {
        if (!input.value) {
          gsap.to(label, { y: 0, scale: 1, color: '', duration: 0.3, ease: 'power2.out' });
        }
      });
    }
  });

  console.log('✨ Avasna v7 — Award-Winning');
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAvasna);
} else {
  initAvasna();
}

// Handle browser back/forward (bfcache restore)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    const overlay = document.querySelector('.page-transition');
    if (overlay) {
      overlay.style.transformOrigin = 'top';
      overlay.style.transform = 'scaleY(0)';
    }
    const zoomOverlay = document.querySelector('.project-zoom-overlay');
    if (zoomOverlay) {
      zoomOverlay.classList.remove('active');
    }
    // Restore any hidden cards
    document.querySelectorAll('.project-card, .works-gallery__item, .project-nav-full').forEach(c => {
      c.style.visibility = '';
    });
  }
});
