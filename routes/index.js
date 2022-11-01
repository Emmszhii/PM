const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../config/auth');

// User model
const { Account, User } = require('../models/User');

// Welcome Page
router.get('/', ensureAuthenticated, (req, res) => {
  res.render('home', { type: req.user.type });
});

// // fetch user information
router.get('/getInfo', ensureAuthenticated, async (req, res) => {
  const { _id, first_name, middle_name, last_name, type } = req.user;
  try {
    res.status(200).json({
      _id,
      first_name,
      middle_name,
      last_name,
      type,
      AGORA_APP_ID: process.env.AGORA_APP_ID,
    });
  } catch (e) {
    res.status(400).json({ err: 'Something gone wrong!' });
  }
});

router.get('/connection-secure', async (req, res) => {
  res.render('404', {
    title: `Connection is not secure`,
    message: `Please use a https connection to use this site`,
  });
});

module.exports = router;
