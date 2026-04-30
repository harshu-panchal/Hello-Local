import { Request, Response } from 'express';
import Contact from '../../../models/Contact';
import { sendBroadcastNotification } from '../../../services/notificationService';
import nodemailer from 'nodemailer';

export const replyToContactInquiry = async (req: Request, res: Response) => {
  try {
    const { email, subject, message } = req.body;

    if (!email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, subject, and message.'
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Re: ${subject}`,
      text: message,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: 'Reply sent successfully.'
    });
  } catch (error: any) {
    console.error('Reply inquiry error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while sending reply.'
    });
  }
};

export const getContactInquiries = async (_req: Request, res: Response) => {

  try {
    const inquiries = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: inquiries
    });
  } catch (error: any) {
    console.error('Fetch inquiries error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while fetching inquiries.'
    });
  }
};

export const submitContactForm = async (req: Request, res: Response) => {

  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and message.'
      });
    }

    // Save to Database
    const newContact = await Contact.create({
      name,
      email,
      subject,
      message
    });

    // Notify Admin via In-App Notification
    await sendBroadcastNotification(
      'Admin',
      'New Contact Inquiry',
      `You have a new inquiry from ${name} (${email}). Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      {
        type: 'Info',
        priority: 'Medium'
      }
    );

    // Send Email via Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.DEFAULT_ADMIN_EMAIL || 'Hellolocal.in@gmail.com',
      replyTo: email,
      subject: 'New Contact Message – HelloLocal',
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    };

    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact email sent successfully to admin:', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          messageId: info.messageId,
        });
      } else {
        console.warn('Email credentials missing, skipping email send.');
      }
    } catch (emailError) {
      console.error('Error sending contact email:', emailError);
      // We don't fail the whole request if email fails, as we saved to DB and sent in-app notification
    }

    return res.status(201).json({
      success: true,
      data: newContact,
      message: 'Your message has been sent successfully. We will get back to you soon.'
    });
  } catch (error: any) {
    console.error('Contact form submission error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while submitting contact form.'
    });
  }
};


