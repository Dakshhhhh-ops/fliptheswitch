import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };

// `?static` renders a still page with everything visible: for screenshots.
export const isStatic = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('static');

// No motion for people who asked for less, and none in static snapshots.
export const calm = () =>
  typeof window !== 'undefined' && (isStatic() || window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

// The running Lenis instance, if any, so a modal can pause page scrolling.
let smooth = null;

// Stops the page behind a modal from scrolling, with or without Lenis.
export function lockScroll(on) {
  document.documentElement.style.overflow = on ? 'hidden' : '';
  if (on) smooth?.stop();
  else smooth?.start();
}

// Smooth scrolling that ScrollTrigger reads, so pinned sections stay in step.
export function useSmoothScroll(enabled) {
  useEffect(() => {
    if (!enabled || calm()) return undefined;
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    smooth = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    const onClick = (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -60 });
      }
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
      smooth = null;
    };
  }, [enabled]);
}

// Plays an entrance when elements actually come on screen. It uses the
// browser's own visibility check, so it can't be thrown off by sections above
// that pin or change height after this was set up. Returns a cleanup.
// `container` is watched; when any of it shows, all `items` play in, staggered.
export function revealOnView(container, items, from, to = {}) {
  const els = [...items];
  if (calm() || !container || els.length === 0) return () => {};
  gsap.set(els, from);
  let tween;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      tween = gsap.to(els, { y: 0, yPercent: 0, x: 0, autoAlpha: 1, duration: 1, ease: 'expo.out', stagger: 0.07, ...to });
    },
    { threshold: 0.05 },
  );
  io.observe(container);
  return () => {
    io.disconnect();
    tween?.kill();
    gsap.set(els, { clearProps: 'transform,opacity,visibility' });
  };
}

// Pulls an element toward the pointer while it hovers.
export function magnetic(el, strength = 0.3) {
  if (!el || calm() || !finePointer()) return () => {};
  const move = (e) => {
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * strength, y: (e.clientY - r.top - r.height / 2) * strength, duration: 0.5, ease: 'power3.out' });
  };
  const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseleave', leave);
  return () => {
    el.removeEventListener('mousemove', move);
    el.removeEventListener('mouseleave', leave);
  };
}
