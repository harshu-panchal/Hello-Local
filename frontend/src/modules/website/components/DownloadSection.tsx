import { motion } from 'framer-motion';

const DownloadSection = () => {
  return (
    <section id="download" className="py-10 px-6 relative overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="container mx-auto max-w-5xl gradient-bg rounded-[2.5rem] p-8 md:p-12 text-center text-white relative overflow-hidden shadow-2xl shadow-[#ff3d8d30]"
      >
        {/* Floating Shapes */}
        <div className="absolute top-[-50px] left-[-50px] w-64 h-64 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-white/10 rounded-full blur-3xl animate-float" />
        
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
            Download Hello Local Today
          </h2>
          <p className="text-white/80 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Experience the fastest way to shop from nearby stores. Everything you need is just a few taps away.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            {/* Play Store Button */}
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-white text-neutral-900 px-7 py-3.5 rounded-2xl flex items-center gap-3 shadow-xl font-bold min-w-[200px]"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5,1.1c-0.2,0.1-0.4,0.3-0.5,0.6C4.1,2.5,4,3.7,4,5.2v13.6c0,1.5,0.1,2.7,0.5,3.5c0.1,0.3,0.3,0.5,0.5,0.6l10.9-10.9L5,1.1z M16.7,12.8L12.5,17l3.8,3.8c0.6,0.6,1.4,0.9,2.2,0.9l2.8-2.1L16.7,12.8z M21.3,7.3l-2.8-2.1c-0.8,0-1.6,0.3-2.2,0.9L12.5,9.8l4.2,4.2L21.3,7.3z M15.7,12L15.7,12L15.7,12z"/>
                </svg>
              </div>
              <div className="text-left">
                <span className="block text-[10px] uppercase opacity-60">Get it on</span>
                <span className="text-lg">Google Play</span>
              </div>
            </motion.button>

            {/* App Store Button */}
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-neutral-900 text-white px-7 py-3.5 rounded-2xl flex items-center gap-3 shadow-xl font-bold min-w-[200px]"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05,20.28c-0.96,0.95-2.05,1.82-3.32,1.85c-1.28,0.02-1.68-0.74-3.15-0.74c-1.47,0-1.92,0.73-3.08,0.76 c-1.25,0.03-2.31-0.89-3.27-1.85c-1.9-1.93-3.36-5.46-3.36-8.76c0-3.32,1.69-5.11,3.25-5.11c1.23,0,2.15,0.74,3.15,0.74 c0.99,0,2.18-0.85,3.48-0.85c1.42,0,3.12,0.85,3.95,2.05L17.75,8.3c-1.5,0.83-2.52,2.37-2.52,4.12c0,1.75,1.02,3.3,2.5,4.13 L17.05,20.28z M12.03,6.23c-0.03-1.4,0.79-2.73,1.96-3.51C12.82,1.7,11.2,1,9.63,1c-0.21,0-0.42,0.01-0.63,0.03 c0.04,1.4,0.71,2.77,1.86,3.61C11,5.63,12.02,6.23,12.03,6.23z"/>
                </svg>
              </div>
              <div className="text-left">
                <span className="block text-[10px] uppercase opacity-60">Download on</span>
                <span className="text-lg">App Store</span>
              </div>
            </motion.button>
          </div>

          <div className="mt-10 flex justify-center gap-8">
             <div className="text-center">
                <span className="block text-xl font-extrabold mb-1">500k+</span>
                <span className="text-white/60 text-[10px] font-bold uppercase">Downloads</span>
             </div>
             <div className="w-[1px] h-8 bg-white/20"></div>
             <div className="text-center">
                <span className="block text-xl font-extrabold mb-1">4.8</span>
                <span className="text-white/60 text-[10px] font-bold uppercase">App Rating</span>
             </div>
             <div className="w-[1px] h-8 bg-white/20"></div>
             <div className="text-center">
                <span className="block text-xl font-extrabold mb-1">50k+</span>
                <span className="text-white/60 text-[10px] font-bold uppercase">Reviews</span>
             </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default DownloadSection;
