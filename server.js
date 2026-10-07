const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '2348065639050';
const EMAIL_TO = process.env.EMAIL_TO || process.env.SMTP_USER || 'imamuqaloonacademy@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_COOKIE_NAME = 'iqa_admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const adminSessions = new Map();
const loginAttempts = new Map();
const contactAttempts = new Map();
const DB_PATH = path.join(__dirname, 'data', 'noor_academy.db');
const CSV_PATH = path.join(__dirname, 'data', 'leads.csv');
let resolveDatabaseReady;
let rejectDatabaseReady;
const databaseReady = new Promise((resolve, reject) => {
  resolveDatabaseReady = resolve;
  rejectDatabaseReady = reject;
});

if (!ADMIN_PASSWORD) {
  console.warn('ADMIN_PASSWORD is not configured; admin login is disabled until it is set.');
}

const db = new sqlite3.Database(DB_PATH, (error) => {
  if (error) {
    console.error('SQLite connection error:', error.message);
    rejectDatabaseReady(error);
    return;
  }

  initDatabase().then(resolveDatabaseReady).catch(rejectDatabaseReady);
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});
app.use(express.urlencoded({ extended: true, limit: '25kb' }));
app.use(express.json({ limit: '25kb' }));
app.use((req, res, next) => {
  if (req.path === '/admin.html') {
    return res.redirect('/admin');
  }

  return next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', async (req, res, next) => {
  try {
    await databaseReady;
    return next();
  } catch (error) {
    console.error('Database is not ready:', error);
    return res.status(503).json({ success: false, message: 'The lead service is temporarily unavailable.' });
  }
});

function initDatabase() {
  const directory = path.dirname(DB_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        learner TEXT,
        program TEXT NOT NULL,
        state TEXT,
        message TEXT,
        source TEXT,
        status TEXT,
        created_at TEXT NOT NULL
      )
    `, (error) => {
      if (error) {
        console.error('Failed to initialize leads table:', error);
        reject(error);
        return;
      }

      migrateLeadSchema().then(resolve).catch(reject);
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onComplete(error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateContactInput(payload) {
  if (!payload.name || !payload.name.trim()) return 'Please provide your name.';
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return 'Please provide a valid email address.';
  if (!payload.program || !payload.program.trim()) return 'Please select a program.';
  if (!payload.learner || !payload.learner.trim()) return 'Please tell us who the program is for.';
  if (!payload.state || !payload.state.trim()) return 'Please select the applicant state.';
  if (payload.message.length > 2000) return 'Please keep your message under 2,000 characters.';
  if (payload.consent !== 'on' && payload.consent !== 'true') return 'Please agree to be contacted about your inquiry.';
  return null;
}

async function migrateLeadSchema() {
  const columns = await allSql('PRAGMA table_info(leads)');
  const hasStateColumn = columns.some((column) => column.name === 'state');
  if (!hasStateColumn) {
    await runSql('ALTER TABLE leads ADD COLUMN state TEXT');
  }

  const rows = await allSql('SELECT id, created_at FROM leads ORDER BY created_at ASC, id ASC');
  const legacyRows = rows.filter((row) => !/^IQA-\d{2}-\d{4,}$/.test(row.id));
  const nextNumbers = new Map();

  rows.forEach((row) => {
    const match = String(row.id).match(/^IQA-(\d{2})-(\d+)$/);
    if (match) {
      nextNumbers.set(match[1], Math.max(nextNumbers.get(match[1]) || 0, Number(match[2])));
    }
  });

  if (legacyRows.length) {
    await runSql('BEGIN TRANSACTION');
    try {
      for (const row of legacyRows) {
        const year = new Date(row.created_at).getUTCFullYear().toString().slice(-2);
        const nextNumber = (nextNumbers.get(year) || 0) + 1;
        nextNumbers.set(year, nextNumber);
        const newId = `IQA-${year}-${String(nextNumber).padStart(4, '0')}`;
        await runSql('UPDATE leads SET id = ? WHERE id = ?', [newId, row.id]);
      }
      await runSql('COMMIT');
    } catch (error) {
      await runSql('ROLLBACK');
      throw error;
    }
  }

  const csvHeader = fs.existsSync(CSV_PATH)
    ? fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/, 1)[0]
    : '';
  const csvNeedsSync = !csvHeader.includes(',state,');

  if (!hasStateColumn || legacyRows.length || csvNeedsSync) {
    const migratedRows = await allSql('SELECT * FROM leads ORDER BY created_at DESC');
    try {
      writeLeadsCsv(migratedRows);
    } catch (error) {
      console.warn('Lead database migration completed, but CSV sync was deferred:', error.message);
    }
  }
}

function buildWhatsappLink(payload) {
  const text = `Hello Imamu Qaloon Academy (IQA), I am ${payload.name} from ${payload.state}. I would like to learn more about ${payload.program}. My email is ${payload.email}. ${payload.message ? `Message: ${payload.message}` : ''}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function buildAdminEmailHtml(record) {
  const leadRows = [
    ['Name', record.name],
    ['Email', record.email],
    ['Phone', record.phone || 'Not provided'],
    ['Program', record.program],
    ['Learner', record.learner],
    ['State', record.state || 'Not provided'],
    ['Source', record.source],
    ['Status', record.status],
    ['Submitted', new Date(record.created_at).toLocaleString()],
  ];

  const rowsMarkup = leadRows
    .map(([label, value]) => `
      <tr>
        <td style="padding:12px 14px;border:1px solid #dfe7dc;background:#f7f8f5;font-weight:700;color:#173f36;">${escapeHtml(label)}</td>
        <td style="padding:12px 14px;border:1px solid #dfe7dc;background:#ffffff;color:#22352f;">${escapeHtml(value)}</td>
      </tr>
    `)
    .join('');

  const message = escapeHtml(record.message || 'No additional message provided.');

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif; background:#f7f2e8; padding:24px; color:#22352f;">
      <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #d8dfd9;">
        <div style="background:linear-gradient(135deg,#173f36,#234d44); padding:24px 28px; color:#ffffff;">
          <h2 style="margin:0; font-size:28px;">New inquiry from Imamu Qaloon Academy (IQA)</h2>
          <p style="margin:8px 0 0; opacity:0.9;">A new learner enquiry has been submitted from the academy website.</p>
        </div>

        <div style="padding:28px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            ${rowsMarkup}
          </table>

          <div style="margin-top:24px; padding:18px; border-radius:12px; background:#f8f3e7; border:1px solid #ead9b0; color:#22352f;">
            <div style="font-weight:700; margin-bottom:8px; color:#173f36;">Learner message</div>
            <div style="line-height:1.6; white-space:pre-wrap;">${message}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function createLeadRecord(payload) {
  const createdAt = new Date().toISOString();
  const year = new Date(createdAt).getUTCFullYear().toString().slice(-2);
  const existingIds = await allSql('SELECT id FROM leads WHERE id LIKE ?', [`IQA-${year}-%`]);
  const nextNumber = existingIds.reduce((highest, row) => {
    const match = String(row.id).match(new RegExp(`^IQA-${year}-(\\d+)$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;

  return {
    id: `IQA-${year}-${String(nextNumber).padStart(4, '0')}`,
    name: payload.name,
    email: payload.email,
    phone: payload.phone || '',
    learner: payload.learner,
    program: payload.program,
    state: payload.state,
    message: payload.message || '',
    source: 'website',
    status: 'new',
    created_at: createdAt,
  };
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function writeLeadsCsv(rows) {
  const header = ['id', 'name', 'email', 'phone', 'learner', 'program', 'state', 'message', 'source', 'status', 'created_at'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    lines.push([
      row.id,
      row.name,
      row.email,
      row.phone,
      row.learner,
      row.program,
      row.state,
      row.message,
      row.source,
      row.status,
      row.created_at,
    ].map(csvEscape).join(','));
  });

  fs.writeFileSync(CSV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function appendLeadCsv(row) {
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'id,name,email,phone,learner,program,state,message,source,status,created_at';
    fs.writeFileSync(CSV_PATH, `${header}\n`, 'utf8');
  }

  const line = [
    row.id,
    row.name,
    row.email,
    row.phone,
    row.learner,
    row.program,
    row.state,
    row.message,
    row.source,
    row.status,
    row.created_at,
  ].map(csvEscape).join(',');

  fs.appendFileSync(CSV_PATH, `${line}\n`, 'utf8');
}

function buildSimpleLeadWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Imamu Qaloon Academy';
  workbook.created = new Date();
  workbook.views = [{ activeTab: 0 }];

  const sheet = workbook.addWorksheet('Leads');
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns = [
    { key: 'id', width: 24 },
    { key: 'name', width: 22 },
    { key: 'email', width: 30 },
    { key: 'phone', width: 18 },
    { key: 'learner', width: 18 },
    { key: 'program', width: 30 },
    { key: 'state', width: 22 },
    { key: 'message', width: 38 },
    { key: 'source', width: 16 },
    { key: 'status', width: 14 },
    { key: 'created_at', width: 24 },
  ];

  const headerRow = sheet.addRow([
    'ID', 'Name', 'Email', 'Phone', 'Learner', 'Program', 'State', 'Message', 'Source', 'Status', 'Created At',
  ]);

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173F36' },
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      name: 'Calibri',
      size: 11,
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB88A38' } },
      left: { style: 'thin', color: { argb: 'FFB88A38' } },
      bottom: { style: 'thin', color: { argb: 'FFB88A38' } },
      right: { style: 'thin', color: { argb: 'FFB88A38' } },
    };
  });

  rows.forEach((row) => {
    const dataRow = sheet.addRow([
      row.id,
      row.name,
      row.email,
      row.phone || '—',
      row.learner,
      row.program,
      row.state || '—',
      row.message || '—',
      row.source,
      row.status || 'new',
      new Date(row.created_at).toLocaleString(),
    ]);

    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        left: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        bottom: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        right: { style: 'thin', color: { argb: 'FFE9DEC2' } },
      };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });

  sheet.autoFilter = {
    from: 'A1',
    to: `K${rows.length + 1}`,
  };

  return workbook;
}

function buildLeadWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Imamu Qaloon Academy';
  workbook.created = new Date();
  workbook.views = [{ activeTab: 0 }];

  const coverSheet = workbook.addWorksheet('Cover');
  coverSheet.views = [{ showGridLines: false }];
  coverSheet.columns = [
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  coverSheet.mergeCells('A1:L3');
  const brandCell = coverSheet.getCell('A1');
  brandCell.value = 'IQA';
  brandCell.font = {
    name: 'Calibri',
    size: 32,
    bold: true,
    color: { argb: 'FF173F36' },
  };
  brandCell.alignment = { vertical: 'middle', horizontal: 'center' };
  brandCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF4D28A' },
  };
  brandCell.border = {
    top: { style: 'medium', color: { argb: 'FFB88A38' } },
    left: { style: 'medium', color: { argb: 'FFB88A38' } },
    bottom: { style: 'medium', color: { argb: 'FFB88A38' } },
    right: { style: 'medium', color: { argb: 'FFB88A38' } },
  };

  coverSheet.mergeCells('A4:L6');
  const titleCell = coverSheet.getCell('A4');
  titleCell.value = 'Imamu Qaloon Academy';
  titleCell.font = {
    name: 'Calibri',
    size: 24,
    bold: true,
    color: { argb: 'FF173F36' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFAF4EA' },
  };

  coverSheet.mergeCells('A7:L9');
  const subTitle = coverSheet.getCell('A7');
  subTitle.value = 'Lead Report & Enquiry Dashboard';
  subTitle.font = {
    name: 'Calibri',
    size: 14,
    italic: true,
    color: { argb: 'FFB88A38' },
  };
  subTitle.alignment = { vertical: 'middle', horizontal: 'center' };

  const statStartRow = 11;
  const summaryRows = [
    ['TOTAL LEADS', rows.length],
    ['NEW', rows.filter((lead) => (lead.status || 'new').toLowerCase() === 'new').length],
    ['THIS MONTH', rows.filter((lead) => {
      const created = new Date(lead.created_at);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length],
  ];

  summaryRows.forEach(([label, value], index) => {
    const rowIndex = statStartRow + index * 3;
    coverSheet.mergeCells(`A${rowIndex}:F${rowIndex + 1}`);
    const labelCell = coverSheet.getCell(`A${rowIndex}`);
    labelCell.value = label;
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F36' } };
    labelCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
    labelCell.border = { all: { style: 'thin', color: { argb: 'FFB88A38' } } };

    coverSheet.mergeCells(`G${rowIndex}:L${rowIndex + 1}`);
    const valueCell = coverSheet.getCell(`G${rowIndex}`);
    valueCell.value = value;
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4D28A' } };
    valueCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF173F36' } };
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' };
    valueCell.border = { all: { style: 'thin', color: { argb: 'FFB88A38' } } };
  });

  coverSheet.getCell('A21').value = 'Prepared for the academy admin team';
  coverSheet.getCell('A21').font = {
    name: 'Calibri',
    size: 12,
    italic: true,
    color: { argb: 'FF5F6F6A' },
  };

  const sheet = workbook.addWorksheet('Leads');
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns = [
    { key: 'id', width: 24 },
    { key: 'name', width: 22 },
    { key: 'email', width: 30 },
    { key: 'phone', width: 18 },
    { key: 'learner', width: 18 },
    { key: 'program', width: 30 },
    { key: 'state', width: 22 },
    { key: 'message', width: 38 },
    { key: 'source', width: 16 },
    { key: 'status', width: 14 },
    { key: 'created_at', width: 24 },
  ];

  const headerRow = sheet.addRow([
    'ID', 'Name', 'Email', 'Phone', 'Learner', 'Program', 'State', 'Message', 'Source', 'Status', 'Created At',
  ]);

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173F36' },
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      name: 'Calibri',
      size: 11,
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB88A38' } },
      left: { style: 'thin', color: { argb: 'FFB88A38' } },
      bottom: { style: 'thin', color: { argb: 'FFB88A38' } },
      right: { style: 'thin', color: { argb: 'FFB88A38' } },
    };
  });

  rows.forEach((row) => {
    const dataRow = sheet.addRow([
      row.id,
      row.name,
      row.email,
      row.phone || '—',
      row.learner,
      row.program,
      row.state || '—',
      row.message || '—',
      row.source,
      row.status || 'new',
      new Date(row.created_at).toLocaleString(),
    ]);

    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        left: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        bottom: { style: 'thin', color: { argb: 'FFE9DEC2' } },
        right: { style: 'thin', color: { argb: 'FFE9DEC2' } },
      };
      cell.alignment = { vertical: 'top', wrapText: true };
      if (cell._column._number === 10) {
        const status = String(cell.value || '').toLowerCase();
        if (status === 'new') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7E7' } };
          cell.font = { color: { argb: 'FF1E5E3C' }, bold: true };
        } else if (status === 'contacted') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7EBC8' } };
          cell.font = { color: { argb: 'FF7B5E14' }, bold: true };
        } else if (status === 'converted') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F7EE' } };
          cell.font = { color: { argb: 'FF14532D' }, bold: true };
        }
      }
    });
  });

  sheet.autoFilter = {
    from: 'A1',
    to: `K${rows.length + 1}`,
  };

  return workbook;
}

async function sendLeadEmail(record) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || `Imamu Qaloon Academy (IQA) <${process.env.SMTP_USER}>`,
    to: EMAIL_TO,
    replyTo: record.email,
    subject: `New Imamu Qaloon Academy (IQA) inquiry: ${record.program}`,
    text: [
      `Name: ${record.name}`,
      `Email: ${record.email}`,
      `Phone: ${record.phone || 'Not provided'}`,
      `Program: ${record.program}`,
      `State: ${record.state || 'Not provided'}`,
      `Audience: ${record.learner}`,
      `Message: ${record.message || 'No message provided'}`,
    ].join('\n\n'),
    html: buildAdminEmailHtml(record),
  };

  await transporter.sendMail(mailOptions);
  return true;
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'imamu-qaloon-academy',
    timestamp: new Date().toISOString(),
  });
});

function isAdminAuthenticated(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) {
          return [cookie, ''];
        }

        const key = cookie.slice(0, separatorIndex);
        const value = cookie.slice(separatorIndex + 1);
        return [key, value];
      })
  );

  const token = cookies[ADMIN_COOKIE_NAME];
  const expiresAt = token ? adminSessions.get(token) : null;

  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}

function getClientAddress(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(store, key, limit, windowMs) {
  const now = Date.now();
  const previous = store.get(key) || [];
  const recent = previous.filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  store.set(key, recent);
  return recent.length > limit;
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ success: false, message: 'Admin access required.' });
  }

  return next();
}

app.get('/admin-login', (req, res) => {
  if (isAdminAuthenticated(req)) {
    return res.redirect('/admin');
  }

  return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  const address = getClientAddress(req);
  if (isRateLimited(loginAttempts, address, 10, 15 * 60 * 1000)) {
    return res.status(429).send('Too many login attempts. Please try again later.');
  }

  const submitted = String(req.body.password || '').trim();

  if (!ADMIN_PASSWORD || submitted !== ADMIN_PASSWORD) {
    return res.redirect(`/admin-login?error=${encodeURIComponent('Incorrect admin password.')}`);
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  adminSessions.set(sessionToken, Date.now() + SESSION_TTL_MS);

  res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  });

  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  const token = String(req.headers.cookie || '').match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`))?.[1];
  if (token) adminSessions.delete(token);
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return res.redirect('/admin-login');
});

app.get('/admin/logout', (req, res) => {
  const token = String(req.headers.cookie || '').match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`))?.[1];
  if (token) adminSessions.delete(token);
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return res.redirect('/admin-login');
});

app.get('/admin', (req, res) => {
  if (!isAdminAuthenticated(req)) {
    return res.redirect('/admin-login');
  }

  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/leads', requireAdmin, async (req, res) => {
  try {
    const rows = await allSql('SELECT * FROM leads ORDER BY created_at DESC');
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: rows.length, leads: rows });
  } catch (error) {
    console.error('Failed to fetch leads:', error);
    res.status(500).json({ success: false, message: 'Unable to fetch leads.' });
  }
});

app.get('/api/leads.csv', requireAdmin, async (req, res) => {
  try {
    const rows = await allSql('SELECT * FROM leads ORDER BY created_at DESC');
    const csv = rows.length
      ? (() => {
          const header = ['id', 'name', 'email', 'phone', 'learner', 'program', 'state', 'message', 'source', 'status', 'created_at'];
          const lines = [header.join(',')];
          rows.forEach((row) => {
            lines.push([
              row.id,
              row.name,
              row.email,
              row.phone,
              row.learner,
              row.program,
              row.state,
              row.message,
              row.source,
              row.status,
              row.created_at,
            ].map(csvEscape).join(','));
          });
          return `${lines.join('\n')}\n`;
        })()
      : 'id,name,email,phone,learner,program,state,message,source,status,created_at\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="imamu_qaloon_leads.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Failed to export CSV:', error);
    res.status(500).json({ success: false, message: 'Unable to export leads.' });
  }
});

app.get('/api/leads.raw.xlsx', requireAdmin, async (req, res) => {
  try {
    const rows = await allSql('SELECT * FROM leads ORDER BY created_at DESC');
    const workbook = buildSimpleLeadWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="imamu_qaloon_leads_raw.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to export raw Excel workbook:', error);
    res.status(500).json({ success: false, message: 'Unable to export raw lead data.' });
  }
});

app.get('/api/leads.xlsx', requireAdmin, async (req, res) => {
  try {
    const rows = await allSql('SELECT * FROM leads ORDER BY created_at DESC');
    const workbook = buildLeadWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="imamu_qaloon_leads.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to export Excel workbook:', error);
    res.status(500).json({ success: false, message: 'Unable to export leads workbook.' });
  }
});

app.patch('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    const leadId = String(req.params.id || '');
    const payload = {
      name: String(req.body.name || '').trim(),
      email: String(req.body.email || '').trim(),
      phone: String(req.body.phone || '').trim(),
      learner: String(req.body.learner || '').trim(),
      program: String(req.body.program || '').trim(),
      state: String(req.body.state || '').trim(),
      message: String(req.body.message || '').trim(),
      status: String(req.body.status || 'new').trim(),
    };

    if (!leadId) {
      return res.status(400).json({ success: false, message: 'Lead ID is required.' });
    }

    if (!payload.name || !payload.email || !payload.program || !payload.learner) {
      return res.status(400).json({ success: false, message: 'Name, email, learner, and program are required.' });
    }

    const allowedStatus = ['new', 'contacted', 'follow-up', 'enrolled'];
    if (!allowedStatus.includes(payload.status.toLowerCase())) {
      payload.status = 'new';
    }

    await runSql(
      `UPDATE leads
       SET name = ?, email = ?, phone = ?, learner = ?, program = ?, state = ?, message = ?, status = ?
       WHERE id = ?`,
      [
        payload.name,
        payload.email,
        payload.phone,
        payload.learner,
        payload.program,
        payload.state,
        payload.message,
        payload.status,
        leadId,
      ]
    );

    const updatedLead = await allSql('SELECT * FROM leads WHERE id = ?', [leadId]);
    return res.json({ success: true, lead: updatedLead[0] || null });
  } catch (error) {
    console.error('Failed to update lead:', error);
    return res.status(500).json({ success: false, message: 'Unable to update lead.' });
  }
});

app.delete('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    const leadId = String(req.params.id || '');

    if (!leadId) {
      return res.status(400).json({ success: false, message: 'Lead ID is required.' });
    }

    const existing = await allSql('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    await runSql('DELETE FROM leads WHERE id = ?', [leadId]);
    return res.json({ success: true, deletedId: leadId });
  } catch (error) {
    console.error('Failed to delete lead:', error);
    return res.status(500).json({ success: false, message: 'Unable to delete lead.' });
  }
});

app.post('/api/contact', async (req, res) => {
  if (isRateLimited(contactAttempts, getClientAddress(req), 20, 15 * 60 * 1000)) {
    return res.status(429).json({ success: false, message: 'Too many inquiries from this connection. Please try again later.' });
  }

  const payload = {
    name: String(req.body.name || '').trim(),
    email: String(req.body.email || '').trim(),
    phone: String(req.body.phone || '').trim(),
    learner: String(req.body.learner || '').trim(),
    program: String(req.body.program || '').trim(),
    state: String(req.body.state || '').trim(),
    message: String(req.body.message || '').trim(),
    consent: String(req.body.consent || ''),
  };

  const validationError = validateContactInput(payload);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const lead = await createLeadRecord(payload);

  try {
    await runSql(
      `INSERT INTO leads (id, name, email, phone, learner, program, state, message, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lead.id,
        lead.name,
        lead.email,
        lead.phone,
        lead.learner,
        lead.program,
        lead.state,
        lead.message,
        lead.source,
        lead.status,
        lead.created_at,
      ]
    );
    appendLeadCsv(lead);
  } catch (error) {
    console.error('Failed to store lead:', error);
    return res.status(500).json({ success: false, message: 'The inquiry could not be saved.' });
  }

  const whatsappUrl = buildWhatsappLink(payload);
  let emailSent = false;

  try {
    emailSent = await sendLeadEmail(lead);
  } catch (error) {
    console.error('Failed to send lead email:', error);
  }

  const message = emailSent
    ? 'Your inquiry has been saved and emailed to the academy successfully.'
    : 'Your inquiry has been saved to the academy CRM and is ready for review. Email delivery is still waiting for SMTP configuration.';

  return res.json({
    success: true,
    message,
    whatsappUrl,
    emailSent,
    leadId: lead.id,
  });
});

app.get('*', (req, res) => {
  const requestedPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
  const filePath = path.join(__dirname, 'public', requestedPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }

  return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Imamu Qaloon Academy (IQA) server running at http://localhost:${PORT}`);
});
