import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import logo from '../assets/logo.png';

const Hero = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!showSplash) {
      const stageTimer = setInterval(() => {
        setCurrentStage((prev) => (prev + 1) % 3);
      }, 4000);
      return () => clearInterval(stageTimer);
    }
  }, [showSplash]);

  const stages = [
    {
      image: '/assets/img1.jpg',
      title: "Place Your Order",
      desc: "Pick from local favorites",
      color: "from-[#ff6a5c] to-[#ff3d8d]"
    },
    {
      image: '/assets/img2.jpg',
      title: "Fast Delivery",
      desc: "Our partner is on the way",
      color: "from-[#ffb457] to-[#ff7051]"
    },
    {
      image: '/assets/img3.jpg',
      title: "Order Received!",
      desc: "Happiness delivered to you",
      color: "from-[#4F46E5] to-[#7C3AED]"
    }
  ];

  return (
    <section id="home" className="relative min-h-[90vh] pt-24 pb-12 overflow-hidden flex items-center bg-white">
      {/* Background Blobs - refined for better placement */}
      <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#ff3d8d]/10 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-[0%] right-[-5%] w-[500px] h-[500px] bg-[#ffa63d]/10 rounded-full blur-[100px] animate-pulse" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Side: Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-50 border border-neutral-100 mb-8"
            >
              <span className="flex h-2 w-2 rounded-full bg-[#ff3d8d]"></span>
              <span className="text-sm font-semibold text-neutral-600">Your Local Shopping Partner</span>
            </motion.div>

            <h1 className="text-4xl md:text-6xl font-black leading-[1.1] mb-6 tracking-tight text-neutral-900">
              Shop Local Favorites <br />
              <span className="gradient-text">Delivered Instantly</span>
            </h1>
            
            <p className="text-neutral-500 text-lg md:text-xl mb-10 leading-relaxed max-w-lg">
              Get groceries, fashion, and electronics delivered from shops in your neighborhood. Quick, reliable, and just a tap away.
            </p>

            <div className="flex flex-wrap gap-5 mb-12">
              <motion.button 
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className="btn-gradient px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl shadow-[#ff3d8d30] flex items-center gap-3"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Get the App
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 rounded-2xl bg-white border border-neutral-200 font-bold text-lg text-neutral-700 hover:bg-neutral-50 transition-all shadow-sm"
              >
                Explore More
              </motion.button>
            </div>

            <div className="flex items-center gap-6 p-4 bg-neutral-50/50 rounded-2xl border border-neutral-100 w-fit">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-neutral-200 overflow-hidden shadow-sm">
                    <img src={`https://i.pravatar.cc/100?img=${i + 20}`} alt="user" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-neutral-900 font-black text-lg">10k+</span>
                  <div className="flex text-yellow-400">
                    {[1,2,3,4,5].map(star => <svg key={star} width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>)}
                  </div>
                </div>
                <p className="text-sm font-medium text-neutral-500 italic">"Love the speed of delivery!"</p>
              </div>
            </div>
          </motion.div>

          {/* Right Side: Phone Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="relative flex justify-center lg:justify-end"
          >
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-gradient-to-br from-[#ff3d8d20] to-[#ffa63d20] rounded-full blur-[80px] z-0" />
            
            {/* Main Phone Mockup */}
            <div className="relative z-10 w-[220px] md:w-[260px] h-[460px] md:h-[540px] bg-neutral-900 rounded-[3rem] p-2.5 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.3)] border-[6px] border-neutral-800 ring-4 ring-neutral-900/5 overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-neutral-800 rounded-b-3xl z-40" />
              
              <div className="w-full h-full rounded-[2.4rem] bg-white overflow-hidden relative">
                <AnimatePresence mode="wait">
                  {showSplash ? (
                    <motion.div
                      key="splash"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.8, ease: "easeInOut" }}
                      className="absolute inset-0 z-50 gradient-bg flex flex-col items-center justify-center p-8 text-center"
                    >
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                          delay: 0.3, 
                          type: "spring", 
                          stiffness: 260, 
                          damping: 20 
                        }}
                        className="bg-white p-6 rounded-[2.5rem] shadow-2xl mb-6"
                      >
                        <img src={logo} alt="Hello Local" className="w-20 h-20 object-contain" />
                      </motion.div>
                      <h2 className="text-white text-2xl font-black tracking-tight">Hello Local</h2>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="app-simulation"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="w-full h-full relative"
                    >
                      {/* Fixed Top Bar Overlay */}
                      <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/20 to-transparent z-40 p-4 pt-10">
                         <div className="flex items-center justify-between">
                            <div className="bg-white/90 p-1 rounded-lg backdrop-blur-md">
                                <img src={logo} alt="logo" className="w-5 h-5 object-contain" />
                            </div>
                            <div className="w-32 h-7 bg-white/20 backdrop-blur-md rounded-full border border-white/30 flex items-center px-3 gap-2">
                               <div className="w-2 h-2 rounded-full bg-white/60" />
                               <div className="w-16 h-1.5 bg-white/40 rounded-full" />
                            </div>
                            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-md border border-white/30" />
                         </div>
                      </div>

                      {/* Animated Full Screen Content */}
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentStage}
                          initial={{ opacity: 0, scale: 1.05 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="absolute inset-0 z-10"
                        >
                          <img 
                            src={stages[currentStage].image} 
                            alt="app stage" 
                            className="w-full h-full object-cover"
                          />
                          
                          {/* Bottom Gradient for Text Readability */}
                          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent z-20" />

                          {/* Text Overlay */}
                          <div className="absolute bottom-24 inset-x-4 p-5 rounded-[2rem] bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl text-center z-30">
                            <motion.h3 
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: 0.3 }}
                              className="text-lg font-black text-white"
                            >
                              {stages[currentStage].title}
                            </motion.h3>
                            <motion.p 
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: 0.4 }}
                              className="text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] mt-1.5"
                            >
                              {stages[currentStage].desc}
                            </motion.p>
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* Bottom Nav Simulation Overlay */}
                      <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/30 to-transparent z-40 flex items-center justify-around px-4 pb-4">
                        <div className="flex w-full h-14 bg-white/10 backdrop-blur-xl rounded-[2rem] border border-white/20 items-center justify-around px-2 min-w-0">
                          {[0,1,2,3].map(i => (
                            <div key={i} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${i === 2 ? 'bg-[#ff3d8d] shadow-lg shadow-[#ff3d8d50] scale-110' : 'hover:bg-white/10'}`}>
                              {i === 2 ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M6 2L3 6v15a1 1 0 001 1h16a1 1 0 001-1V6l-3-4H6z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 01-8 0"></path></svg>
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Floating Notification Cards */}
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-12 -right-4 md:-right-8 lg:-right-12 z-20 hidden sm:block"
            >
              <div className="glass-card p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-white/80 w-[180px] md:w-[200px]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 gradient-bg rounded-2xl flex items-center justify-center shadow-lg shadow-[#ff3d8d30]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Order Status</span>
                    <span className="font-bold text-neutral-800 text-sm">Delivered! 🍕</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 15, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute bottom-24 -left-4 md:-left-12 lg:-left-20 z-20 hidden sm:block"
            >
              <div className="glass-card p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-white/80 w-[160px] md:w-[180px]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#4F46E5] rounded-2xl flex items-center justify-center shadow-lg shadow-[#4f46e530]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  </div>
                  <div>
                    <span className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Tracking</span>
                    <span className="font-bold text-neutral-800 text-sm">3 Mins Away</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
