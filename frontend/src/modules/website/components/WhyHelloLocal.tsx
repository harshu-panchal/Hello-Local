import { motion } from 'framer-motion';

const WhyHelloLocal = () => {
  const benefits = [
    "Instant local delivery",
    "Trusted sellers from your neighborhood",
    "Huge variety of products & categories",
    "Clean, modern and easy-to-use UI",
    "Tailored for quick commerce experience"
  ];

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-20 items-center">
        {/* Left: Content */}
        <motion.div
           initial={{ opacity: 0, x: -50 }}
           whileInView={{ opacity: 1, x: 0 }}
           viewport={{ once: true }}
           transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-6xl font-bold mb-10 leading-tight">
            The Smartest Way to <span className="gradient-text">Shop Locally</span>
          </h2>
          <div className="space-y-6">
            {benefits.map((benefit, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4"
              >
                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <span className="text-xl font-medium text-neutral-700">{benefit}</span>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 p-8 bg-neutral-50 rounded-[2.5rem] border border-neutral-100 relative">
             <div className="absolute top-[-20px] left-8 w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center text-white shadow-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
             </div>
             <p className="text-xl italic text-neutral-600 mb-6">
               "Hello Local has completely changed how I shop. I get everything from fresh vegetables to my favorite electronics in minutes!"
             </p>
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-neutral-200 overflow-hidden">
                    <img src="https://i.pravatar.cc/100?img=33" alt="user" />
                </div>
                <div>
                    <span className="block font-bold">Rohan Sharma</span>
                    <span className="text-sm text-neutral-400">Regular Customer</span>
                </div>
             </div>
          </div>
        </motion.div>

        {/* Right: Illustration/Mockup */}
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           whileInView={{ opacity: 1, scale: 1 }}
           viewport={{ once: true }}
           transition={{ duration: 0.8 }}
           className="relative"
        >
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-64 h-64 gradient-bg rounded-full blur-[100px] opacity-20 -z-10" />
          
          <div className="bg-neutral-50 p-12 rounded-[4rem] relative">
             <img 
               src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&q=80&w=1000" 
               alt="shopping" 
               className="rounded-[3rem] shadow-2xl"
             />
             
             {/* Floating Info Card */}
             <motion.div 
               animate={{ y: [0, -15, 0] }}
               transition={{ duration: 4, repeat: Infinity }}
               className="absolute bottom-10 right-[-30px] w-64 bg-white p-6 rounded-3xl shadow-2xl border border-neutral-100 z-10"
             >
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <span className="font-bold">Verified Store</span>
                </div>
                <div className="space-y-2">
                    <div className="w-full h-2 bg-neutral-100 rounded-full"></div>
                    <div className="w-2/3 h-2 bg-neutral-100 rounded-full"></div>
                </div>
             </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default WhyHelloLocal;
