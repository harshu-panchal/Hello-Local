const Footer = () => {
    return (
      <footer className="bg-neutral-900 text-white pt-24 pb-12 overflow-hidden relative">
        {/* Background Gradient Blob */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] gradient-bg opacity-10 blur-[150px] rounded-full -z-0" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
            {/* Logo & About */}
            <div className="col-span-1 lg:col-span-1">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-lg">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 22V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M21 7L12 12L3 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
                <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#ff6a5c] to-[#ff3d8d]">
                  Hello Local
                </span>
              </div>
              <p className="text-neutral-400 text-lg leading-relaxed mb-8">
                The neighborhood quick commerce platform delivering everything you need in minutes. Supporting local businesses, empowering local lives.
              </p>
              <div className="flex gap-4">
                {['instagram', 'twitter', 'linkedin', 'github'].map((social) => (
                  <a 
                    key={social} 
                    href="#" 
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:gradient-bg transition-all group"
                  >
                     <img src={`https://cdn-icons-png.flaticon.com/512/2111/2111${social === 'instagram' ? '463' : social === 'twitter' ? '470' : social === 'linkedin' ? '476' : '432'}.png`} alt={social} className="w-5 h-5 invert opacity-60 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
  
            {/* Product */}
            <div>
              <h4 className="text-xl font-bold mb-8">Product</h4>
              <ul className="space-y-4 text-neutral-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#categories" className="hover:text-white transition-colors">Categories</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#download" className="hover:text-white transition-colors">App Download</a></li>
              </ul>
            </div>
  
            {/* Company */}
            <div>
              <h4 className="text-xl font-bold mb-8">Company</h4>
              <ul className="space-y-4 text-neutral-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
  
            {/* Contact Info */}
            <div>
              <h4 className="text-xl font-bold mb-8">Reach Us</h4>
              <ul className="space-y-4 text-neutral-400">
                <li className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    support@hellolocal.com
                </li>
                <li className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    +1 (234) 567-890
                </li>
              </ul>
            </div>
          </div>
  
          {/* Bottom Bar */}
          <div className="pt-12 border-t border-white/10 flex flex-col md:row gap-6 justify-between items-center text-neutral-500 font-medium">
            <p>© 2026 Hello Local. All rights reserved.</p>
            <div className="flex gap-8">
                <a href="#" className="hover:text-white transition-colors">Terms</a>
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    );
  };
  
  export default Footer;
  
