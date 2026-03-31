const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'exam-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

// Helper: read/write JSON data files
const readData = (file) => {
  const filePath = path.join(__dirname, 'data', file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeData = (file, data) => {
  const filePath = path.join(__dirname, 'data', file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Auth middleware
const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login.html');
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login.html');
  next();
};

// ─── AUTH ROUTES ─────────────────────────────────────

// POST /login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readData('users.json');
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.json({ success: false, message: 'Invalid username or password.' });
  req.session.user = user;
  res.json({ success: true, role: user.role });
});

// POST /logout
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /me — returns current session user
app.get('/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// ─── ADMIN ROUTES ─────────────────────────────────────

// GET /admin/questions
app.get('/admin/questions', requireAdmin, (req, res) => {
  res.json(readData('questions.json'));
});

// POST /admin/questions — add new question
app.post('/admin/questions', requireAdmin, (req, res) => {
  const { question, options, answer } = req.body;
  if (!question || !options || answer === undefined) {
    return res.json({ success: false, message: 'Missing fields.' });
  }
  const questions = readData('questions.json');
  const newQ = {
    id: Date.now(),
    question,
    options,        // array of 4 strings
    answer: parseInt(answer)  // index 0-3
  };
  questions.push(newQ);
  writeData('questions.json', questions);
  res.json({ success: true, question: newQ });
});

// DELETE /admin/questions/:id
app.delete('/admin/questions/:id', requireAdmin, (req, res) => {
  let questions = readData('questions.json');
  questions = questions.filter(q => q.id !== parseInt(req.params.id));
  writeData('questions.json', questions);
  res.json({ success: true });
});

// ─── EXAM ROUTES ─────────────────────────────────────

// GET /exam/questions — student gets questions (without answers)
app.get('/exam/questions', requireLogin, (req, res) => {
  const questions = readData('questions.json');
  if (questions.length === 0) return res.json({ success: false, message: 'No questions available.' });
  // Strip answer before sending
  const safeQuestions = questions.map(({ id, question, options }) => ({ id, question, options }));
  res.json({ success: true, questions: safeQuestions });
});

// POST /exam/submit — grade the exam
app.post('/exam/submit', requireLogin, (req, res) => {
  const { answers } = req.body; // { questionId: selectedOptionIndex }
  const questions = readData('questions.json');
  let score = 0;
  const results = questions.map(q => {
    const selected = answers[q.id];
    const correct = selected !== undefined && parseInt(selected) === q.answer;
    if (correct) score++;
    return {
      question: q.question,
      options: q.options,
      selected: selected !== undefined ? parseInt(selected) : null,
      correctAnswer: q.answer,
      correct
    };
  });
  res.json({
    success: true,
    score,
    total: questions.length,
    percentage: Math.round((score / questions.length) * 100),
    results
  });
});

// ─── START ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Online Exam System running at http://localhost:${PORT}\n`);
});