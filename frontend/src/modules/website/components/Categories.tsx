import { motion } from 'framer-motion';

const Categories = () => {
  const categories = [
    { 
      name: "Food", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
      )
    },
    { 
      name: "Wedding", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
      )
    },
    { 
      name: "Electronics", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
      )
    },
    { 
      name: "Beauty", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 19C19 15.6863 16.3137 13 13 13V13C9.68629 13 7 15.6863 7 19"></path><path d="M13 13C15.2091 13 17 11.2091 17 9C17 6.79086 15.2091 5 13 5C10.7909 5 9 6.79086 9 9C9 11.2091 10.7909 13 13 13Z"></path></svg>
      )
    },
    { 
      name: "Grocery", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      )
    },
    { 
      name: "Fashion", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.623.46a2 2 0 00-1.623 1.96V19a2 2 0 002 2h16a2 2 0 002-2V5.42a2 2 0 00-1.62-1.96z"></path></svg>
      )
    },
    { 
      name: "Health", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
      )
    },
    { 
      name: "Snacks", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v15a1 1 0 001 1h16a1 1 0 001-1V6l-3-4H6z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 01-8 0"></path></svg>
      )
    },
    { 
      name: "Cold Drinks", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 5H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"></path><path d="M12 5V2"></path><path d="M15 2H9"></path><path d="M6 10h12"></path></svg>
      )
    },
    { 
      name: "Baby Care", 
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l5 5v11a2 2 0 0 1-2 2z"></path></svg>
      )
    }
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <section id="categories" className="py-16 bg-[#fff6f7]">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Shop By <span className="gradient-text">Categories</span>
          </h2>
          <p className="text-neutral-500 text-base">Explore various categories and find exactly what you need.</p>
        </div>

        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6"
        >
          {categories.map((cat, index) => (
            <motion.div
              key={index}
              variants={item}
              whileHover={{ y: -10 }}
              className="relative bg-white p-8 rounded-[2.5rem] flex flex-col items-center justify-center shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] border border-neutral-50 overflow-hidden cursor-pointer group transition-all duration-500"
            >
              {/* Slide-up background animation */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#ff3d8d] to-[#ff6a5c] translate-y-[101%] group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-0" />
              
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4 group-hover:bg-white/20 group-hover:scale-110 transition-all duration-500 text-neutral-400 group-hover:text-white">
                  {cat.icon}
                </div>
                <span className="font-bold text-neutral-700 text-sm group-hover:text-white transition-colors duration-300">
                  {cat.name}
                </span>
              </div>

              {/* Decorative sparkle on hover */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity delay-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" /></svg>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-12 text-center">
            <button className="px-8 py-3 rounded-xl bg-white border border-neutral-200 font-bold text-base hover:text-[#ff3d8d] hover:border-[#ff3d8d] transition-all soft-shadow">
                View All Categories
            </button>
        </div>
      </div>
    </section>
  );
};

export default Categories;
