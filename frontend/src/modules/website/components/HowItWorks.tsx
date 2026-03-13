import { motion } from 'framer-motion';

const HowItWorks = () => {
  const steps = [
    {
      id: "01",
      title: "Open App",
      description: "Download and open the Hello Local app on your phone.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
      )
    },
    {
      id: "02",
      title: "Browse Categories",
      description: "Explore wide range of categories and products from nearby.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      )
    },
    {
      id: "03",
      title: "Place Order",
      description: "Add items to your cart and complete checkout securely.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
      )
    },
    {
      id: "04",
      title: "Get Fast Delivery",
      description: "Your order will be delivered to your doorstep in minutes.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
      )
    }
  ];

  return (
    <section id="how-it-works" className="py-16 bg-white relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-neutral-500 text-base">Simple steps to get started with Hello Local.</p>
        </div>

        <div className="relative">
          {/* Connector Line Desktop */}
          <div className="hidden lg:block absolute top-[48px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-[#ff3d8d20] to-transparent z-0" />
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="flex flex-col items-center text-center group"
              >
                <div className="relative mb-6">
                  <motion.div 
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="w-24 h-24 rounded-full gradient-bg flex items-center justify-center text-white shadow-2xl relative z-10"
                  >
                    {step.icon}
                  </motion.div>
                  <span className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-[#ff3d8d] soft-shadow border border-neutral-100 text-base z-20">
                    {step.id}
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed max-w-[220px]">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
