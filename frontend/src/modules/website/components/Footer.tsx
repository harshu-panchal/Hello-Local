import React, { useState } from 'react';
import api from '../../../services/api/config';
import { useToast } from '../../../context/ToastContext';
const Footer = () => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [messageError, setMessageError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    const name = formData.name.trim();
    if (!name) {
      setNameError('Name is required');
      hasError = true;
    } else if (name.length < 2) {
      setNameError('Name must be at least 2 characters');
      hasError = true;
    } else if (!/^[A-Za-z\s]+$/.test(name)) {
      setNameError('Name must contain only letters and spaces');
      hasError = true;
    } else {
      setNameError('');
    }

    const email = formData.email.trim();
    if (!email) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    } else {
      setEmailError('');
    }

    const message = formData.message.trim();
    if (!message) {
      setMessageError('Message is required');
      hasError = true;
    } else if (message.length < 10) {
      setMessageError('Message must be at least 10 characters');
      hasError = true;
    } else {
      setMessageError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      const response = await api.post('/contact', formData);
      if (response.data.success) {
        showToast('Message sent successfully!', 'success');
        setFormData({ name: '', email: '', message: '' });
        setNameError('');
        setEmailError('');
        setMessageError('');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      showToast(error.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'name') {
      const filtered = value.replace(/[^A-Za-z\s]/g, '');
      setFormData(prev => ({ ...prev, name: filtered }));
      if (nameError) setNameError('');
      return;
    }
    if (name === 'message') {
      setFormData(prev => ({ ...prev, message: value.slice(0, 500) }));
      if (messageError) setMessageError('');
      return;
    }
    if (name === 'email' && emailError) setEmailError('');
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const socialLinks: Record<string, string> = {
    instagram: 'https://www.instagram.com/hellolocal.in?igsh=eWp2cW9qMzd1N29p',
    twitter: '#',
    linkedin: '#',
    github: '#'
  };

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
                  <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 22V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 7L12 12L3 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
                  href={socialLinks[social]}
                  target={socialLinks[social] !== '#' ? '_blank' : undefined}
                  rel={socialLinks[social] !== '#' ? 'noopener noreferrer' : undefined}
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

          {/* Reach Us / Contact Form */}
          <div>
            <h4 className="text-xl font-bold mb-8">Reach Us</h4>
            <ul className="space-y-6 text-neutral-400">
              <li>
                <a href="mailto:Hellolocal.in@gmail.com" className="flex items-center gap-3 hover:text-white transition-colors group">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-[#ff3d8d]/10 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#ff3d8d]"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  </div>
                  Hellolocal.in@gmail.com
                </a>
              </li>
            </ul>

            <div className="mt-8">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your Name (letters only)"
                    maxLength={60}
                    className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff3d8d] transition-all ${nameError ? 'border-red-500' : 'border-white/10'}`}
                  />
                  {nameError && <p className="text-xs text-red-400 mt-0.5">{nameError}</p>}
                </div>
                <div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Your Email"
                    className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff3d8d] transition-all ${emailError ? 'border-red-500' : 'border-white/10'}`}
                  />
                  {emailError && <p className="text-xs text-red-400 mt-0.5">{emailError}</p>}
                </div>
                <div>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Message (min 10 characters)"
                    rows={3}
                    maxLength={500}
                    className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff3d8d] transition-all resize-none ${messageError ? 'border-red-500' : 'border-white/10'}`}
                  ></textarea>
                  <div className="flex justify-between items-center mt-0.5">
                    {messageError ? <p className="text-xs text-red-400">{messageError}</p> : <span />}
                    <span className="text-xs text-neutral-500 ml-auto">{formData.message.length}/500</span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-gradient py-3 rounded-lg font-bold text-sm shadow-lg shadow-[#ff3d8d]/20 hover:shadow-[#ff3d8d]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-12 border-t border-white/10 flex flex-col md:row gap-6 justify-between items-center text-neutral-500 font-medium">
          <p>© {new Date().getFullYear()} Hello Local. All rights reserved.</p>
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

