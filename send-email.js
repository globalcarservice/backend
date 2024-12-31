const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'melany.alsarhan@hotmail.com',
    subject: 'Salut Melany Al Sarhan',
    text: `Bună Melany Al Sarhan,

Acesta este un email trimis automat pentru a testa funcționalitatea aplicației noastre.

Cu respect,
Echipa noastră`,
};

transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
        console.error('Error sending email:', err.message);
    } else {
        console.log('Email sent successfully:', info.response);
    }
});
