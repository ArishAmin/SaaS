"use client";

import { useState, useEffect } from "react";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    quote: "Acutize has completely transformed how our business analytics team prepares datasets. What used to take days of Python scripting now takes minutes. The model preview feature alone has saved us countless hours of iteration.",
    author: "Sarah Chen",
    rating: 5,
  },
  {
    quote: "The security posture is exactly what we needed. Being able to process sensitive customer data in a private workspace while giving our analysts access to powerful ML capabilities was the game-changer for our organization.",
    author: "Marcus Rodriguez",
    rating: 5,
  },
  {
    quote: "We rolled out Acutize to our marketing and operations teams. The intuitive UI means even non-technical staff can now safely clean datasets and generate actionable insights without waiting on the core data team.",
    author: "Emma Thompson",
    rating: 5,
  },
];

export function TestimonialSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    if (isHovered || isManual) return;
    const timer = setInterval(() => {
      setCurrentIndex((current) => (current + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isHovered, isManual]);

  const next = () => {
    setIsManual(true);
    setCurrentIndex((current) => (current + 1) % testimonials.length);
  };
  const prev = () => {
    setIsManual(true);
    setCurrentIndex((current) => (current - 1 + testimonials.length) % testimonials.length);
  };
  const goTo = (idx: number) => {
    setIsManual(true);
    setCurrentIndex(idx);
  };

  return (
    <section className="py-20 bg-zinc-50 dark:bg-zinc-950 overflow-hidden border-y border-zinc-200 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            Trusted by Enterprises
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
            Empowering data teams worldwide
          </h2>
        </div>

        <div 
          className="relative max-w-4xl mx-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="relative min-h-[350px] sm:min-h-[300px]">
            {testimonials.map((testimonial, idx) => {
              const isActive = idx === currentIndex;
              return (
                <div
                  key={idx}
                  className={cn(
                    "absolute top-0 left-0 w-full h-full transition-all duration-500 ease-in-out px-4 sm:px-12",
                    isActive ? "opacity-100 translate-x-0 z-10" : "opacity-0 translate-x-8 z-0 pointer-events-none"
                  )}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="flex gap-1 text-amber-400 mb-6">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-current" />
                      ))}
                    </div>
                    <Quote className="w-10 h-10 text-zinc-200 dark:text-zinc-800 mb-4 mx-auto rotate-180" />
                    <p className="text-xl sm:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-8 leading-relaxed max-w-3xl">
                      "{testimonial.quote}"
                    </p>
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-white pb-6">{testimonial.author}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:scale-110 transition-all duration-200 hidden sm:block shadow-sm z-20 cursor-pointer"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <button
            onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:scale-110 transition-all duration-200 hidden sm:block shadow-sm z-20 cursor-pointer"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="flex justify-center gap-2 mt-8">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  idx === currentIndex 
                    ? "bg-blue-600 dark:bg-blue-400 w-8" 
                    : "bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600"
                )}
                aria-label={`Go to testimonial ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
