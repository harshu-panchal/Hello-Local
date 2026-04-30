import { motion } from 'framer-motion';
import screen1 from '../assets/screen1.png';
import screen2 from '../assets/screen2.png';
import screen3 from '../assets/screen3.png';

const AppPreview = () => {
  const screens = [
    {
      title: "Discover Nearby",
      label: "Home Screen",
      image: screen1,
      color: "from-orange-400 to-pink-500",
      delay: 0
    },
    {
      title: "Easy Selection",
      label: "Categories Screen",
      image: screen2,
      color: "from-pink-500 to-rose-600",
      delay: 0.2
    },
    {
      title: "Best Deals",
      label: "Product Listing",
      image: screen3,
      color: "from-rose-600 to-orange-400",
      delay: 0.4
    }
  ];

  return (
    <section id="preview" className="py-24 bg-white overflow-hidden relative">
      {/* Decorative Blobs */}
      <div className="absolute top-[20%] left-[-10%] w-[400px] h-[400px] bg-pink-50 rounded-full blur-[100px] opacity-60" />
      <div className="absolute bottom-[20%] right-[-10%] w-[400px] h-[400px] bg-orange-50 rounded-full blur-[100px] opacity-60" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-20">
          <motion.h2 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black mb-6 tracking-tight"
          >
            A Glimpse Into <span className="gradient-text">Our App</span>
          </motion.h2>
          <p className="text-neutral-500 text-lg font-medium">Designed for speed, built for convenience.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 lg:gap-20">
          {screens.map((screen, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: screen.delay, duration: 0.8 }}
              className="flex flex-col items-center"
            >
              <div className="relative group">
                {/* Background Glass Plate */}
                <div className={`absolute inset-[-15px] bg-gradient-to-br ${screen.color} opacity-5 rounded-[4rem] blur-2xl group-hover:opacity-15 transition-opacity duration-500`} />
                
                {/* Phone Card - Reduced size for better proportions */}
                <motion.div 
                  whileHover={{ y: -10, rotateY: 5, rotateX: 2 }}
                  className="relative z-10 w-[240px] md:w-[260px] h-[480px] md:h-[520px] bg-neutral-900 rounded-[3.5rem] p-2.5 shadow-2xl border-[6px] border-neutral-800 ring-4 ring-neutral-900/5 overflow-hidden"
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-neutral-800 rounded-b-3xl z-30" />
                  
                  <div className="w-full h-full rounded-[2.8rem] bg-white overflow-hidden relative">
                    <img 
                      src={screen.image} 
                      alt={screen.label} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </motion.div>
                
                {/* Label Outside */}
                <div className="mt-12 text-center">
                   <h4 className="text-xl font-black text-neutral-900 mb-2">{screen.title}</h4>
                   <span className="inline-block px-4 py-1.5 rounded-full bg-neutral-50 text-neutral-400 font-bold text-xs uppercase tracking-widest border border-neutral-100 italic">
                     {screen.label}
                   </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AppPreview;
