const { pool } = require('../db/database');
const { requirePerm, getCurrentUser } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { sanitize, isValidDate } = require('../utils/Validation');
const FORM_TEMPLATES = require('../../shared/FormTemplates');

const LEAVE_TYPES = [
  'Vacation Leave (VL)',
  'Sick Leave (SL)',
  'SIL (Service Incentive Leave)',
  'Emergency Leave',
  'Maternity/Paternity Leave',
  'Others'
];

function validSignature(value) {
  return typeof value === 'string' &&
    value.length <= 200000 &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function validateLeaveForm(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const errors = [];
  const position = sanitize(data.position);
  const department = sanitize(data.department);
  const leaveType = sanitize(data.leaveType);
  const dateFrom = data.dateFrom;
  const dateTo = data.dateTo;
  const days = Number(data.days);
  const reason = sanitize(data.reason);
  const payType = data.payType;

  if (!position || position.length > 191) errors.push('Enter your position (up to 191 characters).');
  if (!department || department.length > 191) errors.push('Enter your department (up to 191 characters).');
  if (!LEAVE_TYPES.includes(leaveType)) errors.push('Choose a valid leave type.');
  if (!isValidDate(dateFrom)) errors.push('Enter a valid leave start date.');
  if (!isValidDate(dateTo)) errors.push('Enter a valid leave end date.');
  if (isValidDate(dateFrom) && isValidDate(dateTo)) {
    const start = new Date(dateFrom + 'T00:00:00Z');
    const end = new Date(dateTo + 'T00:00:00Z');
    if (end < start) errors.push('End date must be on or after start date.');
    else if (Number.isFinite(days) && days > (end - start) / 86400000 + 1) {
      errors.push('Leave days cannot exceed the date range.');
    }
  }
  if (!Number.isFinite(days) || days <= 0 || days > 365 || !Number.isInteger(days * 2)) {
    errors.push('Leave days must be greater than 0 and no more than 365, in half-day increments.');
  }
  if (!reason || String(data.reason || '').length > 500) errors.push('Enter a reason (up to 500 characters).');
  if (!['WITH_PAY', 'WITHOUT_PAY'].includes(payType)) errors.push('Choose with pay or without pay.');
  if (leaveType === 'Others' && !sanitize(data.otherLeaveType)) errors.push('Specify the other leave type.');
  if (sanitize(data.otherLeaveType).length > 100) errors.push('Other leave type must be 100 characters or fewer.');
  if (!validSignature(data.signature)) errors.push('Draw your electronic signature before submitting.');
  return errors;
}

function validateUserForm(templateKey, data = {}) {
  const template = FORM_TEMPLATES.find(item => item.key === templateKey && item.key !== 'leave-2026');
  if (!template) return { errors: ['Choose a valid form template.'], data: {} };
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const errors = [];
  const clean = {};
  if (!validSignature(data.signature)) errors.push('Draw your electronic signature before submitting.');

  template.fields.forEach(field => {
    const raw = data[field.name] === null || data[field.name] === undefined ? '' : String(data[field.name]).trim();
    const value = sanitize(raw);
    if (field.required && !value) errors.push(`${field.label} is required.`);
    if (raw.length > (field.maxLength || 191)) errors.push(`${field.label} is too long.`);
    if (field.type === 'date' && value && !isValidDate(value)) errors.push(`${field.label} must be a valid date.`);
    if (field.type === 'time' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors.push(`${field.label} must be a valid time.`);
    if (field.type === 'datetime-local' && value) {
      const [date, time] = value.split('T');
      if (!isValidDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) errors.push(`${field.label} must be a valid date and time.`);
    }
    if (field.type === 'number' && value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < field.min || number > field.max) {
        errors.push(`${field.label} must be between ${field.min} and ${field.max}.`);
      } else {
        const stepPosition = (number - field.min) / field.step;
        if (Math.abs(stepPosition - Math.round(stepPosition)) > 1e-8) errors.push(`${field.label} has an invalid increment.`);
        clean[field.name] = number;
        return;
      }
    }
    clean[field.name] = value;
  });

  if (templateKey === 'time-in-out' &&
      !['inStart', 'amBreakOut', 'amBreakIn', 'lunchBreakOut', 'lunchBreakIn', 'pmBreakOut', 'pmBreakIn', 'outEnd'].some(key => clean[key])) {
    errors.push('Enter at least one time-in, break, or time-out value.');
  }
  if (templateKey === 'official-business-trip' && clean.departure && clean.return && clean.return < clean.departure) {
    errors.push('Date/time of return must not be before departure.');
  }
  clean.signature = data.signature;
  return { errors, data: clean };
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateApprovalSignature(isHead, decision, signature) {
  if (decision === 'APPROVED' && !validSignature(signature)) {
    throw httpError(
      isHead ? 'Draw your signature before forwarding this form.' : 'Draw your signature before approving this form.',
      400);
  }
}

function formatSerialNumber(template, year, sequence) {
  const width = Number(template.sequenceWidth);
  const serialSequence = BigInt(sequence);
  if (!template.prefix || !Number.isInteger(width) || width < 1 || serialSequence < 1n) {
    throw new Error(`Invalid serial number configuration for form template "${template.key}".`);
  }
  return `${template.prefix}-${year}-${serialSequence.toString().padStart(width, '0')}`;
}

function currentSerialYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric'
  }).format(date));
}

function canEditForm(role, form) {
  return ['STAFF', 'HEAD'].includes(role) &&
    form.status === 'PENDING' &&
    form.review_stage === 'HEAD' &&
    Boolean(form.head_reviewer_email);
}

function parseForm(row) {
  return {
    ...row,
    form_data: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data
  };
}

async function listMyForms(req) {
  const user = await requirePerm(req, 'forms.self');
  const [[summary]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'PENDING'), 0) AS pending,
            COALESCE(SUM(status = 'APPROVED'), 0) AS approved,
            COALESCE(SUM(status = 'REJECTED'), 0) AS rejected
     FROM user_forms WHERE user_email = ?`,
    [user.email]);
  const [rows] = await pool.execute(
    `SELECT f.id, f.control_no, f.template_key, f.form_data, f.status, f.review_stage,
            f.head_signature, f.head_signed_by, f.head_signed_at, f.hr_signature,
            f.submitted_at, f.reviewed_by, f.reviewed_at, f.review_notes, f.head_reviewer_email,
            COALESCE(NULLIF(reviewer.full_name, ''), 'HR/Admin') AS reviewed_by_name,
            reviewer.role AS reviewed_by_role,
            CASE WHEN f.status = 'PENDING' THEN DATEDIFF(CURRENT_DATE(), DATE(f.submitted_at)) ELSE NULL END AS days_pending
     FROM user_forms f
     LEFT JOIN user_roles reviewer ON reviewer.email = f.reviewed_by
     WHERE f.user_email = ? ORDER BY f.submitted_at DESC, f.id DESC LIMIT 500`,
    [user.email]);
  const [[head]] = await pool.execute(
    `SELECT h.email, COALESCE(NULLIF(h.full_name, ''), h.email) AS full_name, h.active
     FROM user_roles owner LEFT JOIN user_roles h ON h.email = owner.assigned_head_email
     WHERE owner.email = ? AND owner.active = 1 LIMIT 1`,
    [user.email]);
  return {
    forms: rows.map(parseForm),
    assignedHead: head && head.email
      ? { email: head.email, full_name: head.full_name, active: Boolean(head.active) }
      : null,
    summary: {
      total: Number(summary.total),
      pending: Number(summary.pending),
      approved: Number(summary.approved),
      rejected: Number(summary.rejected)
    }
  };
}

async function getSubmissionHead(email, role) {
  const [rows] = await pool.execute(
    `SELECT u.assigned_head_email, h.role AS head_role, h.active AS head_active
     FROM user_roles u LEFT JOIN user_roles h ON h.email = u.assigned_head_email
     WHERE u.email = ? AND u.active = 1 LIMIT 1`,
    [email]);
  if (!rows.length) throw httpError('Your account is not active.', 401);
  const assignedHead = rows[0].assigned_head_email;
  if (!assignedHead) {
    if (role === 'STAFF') throw httpError('An Admin must assign a Head to your account before you can submit forms.', 409);
    return null;
  }
  if (rows[0].head_role !== 'HEAD' || !rows[0].head_active) {
    throw httpError('Your assigned Head is not active. Contact an Admin before submitting.', 409);
  }
  return assignedHead;
}

async function submitLeaveForm(req, data = {}) {
  const user = await requirePerm(req, 'forms.self');
  const errors = validateLeaveForm(data);
  if (errors.length) throw httpError(errors.join(' '), 400);

  const headEmail = await getSubmissionHead(user.email, user.role);
  const [accounts] = await pool.execute(
    'SELECT full_name FROM user_roles WHERE email = ? AND active = 1 LIMIT 1', [user.email]);

  const formData = {
    name: sanitize(accounts[0].full_name),
    position: sanitize(data.position),
    department: sanitize(data.department),
    leaveType: sanitize(data.leaveType),
    otherLeaveType: sanitize(data.otherLeaveType),
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    days: Number(data.days),
    reason: sanitize(data.reason),
    payType: data.payType,
    signature: data.signature
  };

  return persistUserForm(user.email, user.role, headEmail, 'leave-2026', formData, 'Leave Application');
}

async function submitUserForm(req, templateKey, data = {}) {
  const user = await requirePerm(req, 'forms.self');
  const { errors, data: cleanData } = validateUserForm(templateKey, data);
  if (errors.length) throw httpError(errors.join(' '), 400);

  const headEmail = await getSubmissionHead(user.email, user.role);
  const [accounts] = await pool.execute(
    'SELECT full_name FROM user_roles WHERE email = ? AND active = 1 LIMIT 1', [user.email]);

  cleanData.name = sanitize(accounts[0].full_name);
  const template = FORM_TEMPLATES.find(item => item.key === templateKey);
  return persistUserForm(user.email, user.role, headEmail, templateKey, cleanData, template.title);
}

async function updateMyForm(req, formId, templateKey, data = {}) {
  const user = await requirePerm(req, 'forms.self');
  if (!['STAFF', 'HEAD'].includes(user.role)) {
    throw httpError('Only STAFF and HEAD accounts can edit submitted forms.', 403);
  }

  const template = FORM_TEMPLATES.find(item => item.key === templateKey);
  if (!template) throw httpError('Choose a valid form template.', 400);
  let cleanData;
  if (templateKey === 'leave-2026') {
    const errors = validateLeaveForm(data);
    if (errors.length) throw httpError(errors.join(' '), 400);
    cleanData = {
      position: sanitize(data.position),
      department: sanitize(data.department),
      leaveType: sanitize(data.leaveType),
      otherLeaveType: sanitize(data.otherLeaveType),
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      days: Number(data.days),
      reason: sanitize(data.reason),
      payType: data.payType,
      signature: data.signature
    };
  } else {
    const result = validateUserForm(templateKey, data);
    if (result.errors.length) throw httpError(result.errors.join(' '), 400);
    cleanData = result.data;
  }

  const [[account]] = await pool.execute(
    'SELECT full_name FROM user_roles WHERE email = ? AND active = 1 LIMIT 1',
    [user.email]);
  if (!account) throw httpError('Your account is not active.', 401);
  cleanData.name = sanitize(account.full_name);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, control_no, template_key, status, review_stage, head_reviewer_email
       FROM user_forms WHERE id = ? AND user_email = ? FOR UPDATE`,
      [formId, user.email]);
    if (!rows.length) throw httpError('This form does not exist in your submissions.', 404);
    const existingForm = rows[0];
    if (existingForm.template_key !== templateKey) {
      throw httpError('The form type cannot be changed while editing.', 400);
    }
    if (!canEditForm(user.role, existingForm)) {
      throw httpError('This form can no longer be edited. It must still be pending with its assigned Head.', 409);
    }

    await connection.execute(
      'UPDATE user_forms SET form_data = ? WHERE id = ?',
      [JSON.stringify(cleanData), existingForm.id]);
    await logAudit(user.email, 'FORM_UPDATED', String(existingForm.id),
      `${existingForm.control_no} updated before Head approval`, connection);
    await connection.commit();
    return { ok: true, id: existingForm.id, controlNo: existingForm.control_no, status: existingForm.status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function persistUserForm(email, role, headEmail, templateKey, formData, description) {
  const template = FORM_TEMPLATES.find(item => item.key === templateKey);
  if (!template) throw httpError('Choose a valid form template.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO user_forms
         (control_no, user_email, template_key, form_data, status, review_stage, head_reviewer_email)
       VALUES (NULL, ?, ?, ?, 'PENDING', ?, ?)`,
      [email, templateKey, JSON.stringify(formData), headEmail ? 'HEAD' : 'HR', headEmail]);
    const id = result.insertId;
    const year = currentSerialYear();
    const [[existingSequence]] = await connection.execute(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(control_no, '-', -1) AS UNSIGNED)), 0) AS sequence_value
       FROM user_forms WHERE template_key = ? AND control_no LIKE ?`,
      [templateKey, `${template.prefix}-${year}-%`]);
    await connection.execute(
      `INSERT IGNORE INTO form_serial_sequences (template_key, serial_year, sequence_value)
       VALUES (?, ?, ?)`,
      [templateKey, year, String(existingSequence.sequence_value)]);
    const [[sequenceRow]] = await connection.execute(
      `SELECT sequence_value FROM form_serial_sequences
       WHERE template_key = ? AND serial_year = ? FOR UPDATE`,
      [templateKey, year]);
    const sequence = BigInt(sequenceRow.sequence_value) + 1n;
    const serialNumber = formatSerialNumber(template, year, sequence);
    await connection.execute(
      'UPDATE form_serial_sequences SET sequence_value = ? WHERE template_key = ? AND serial_year = ?',
      [sequence.toString(), templateKey, year]);
    await connection.execute('UPDATE user_forms SET control_no = ? WHERE id = ?', [serialNumber, id]);
    const [[savedForm]] = await connection.execute(
      'SELECT submitted_at FROM user_forms WHERE id = ?', [id]);
    await logAudit(email, 'FORM_SUBMITTED', String(id), `${description} submitted: ${serialNumber}`, connection);
    await connection.commit();
    return { ok: true, id, controlNo: serialNumber, status: 'PENDING', submittedAt: savedForm.submitted_at };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getFormReviewSummary(reviewer) {
  const where = reviewer && reviewer.role === 'HEAD'
    ? 'WHERE head_reviewer_email = ?'
    : "WHERE review_stage = 'HR' OR status IN ('APPROVED', 'REJECTED')";
  const values = reviewer && reviewer.role === 'HEAD'
    ? [reviewer.email]
    : [];
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'PENDING' AND review_stage = '${reviewer && reviewer.role === 'HEAD' ? 'HEAD' : 'HR'}'), 0) AS pending,
            COALESCE(SUM(status = 'APPROVED'), 0) AS approved,
            COALESCE(SUM(status = 'REJECTED'), 0) AS rejected
     FROM user_forms ${where}`,
    values);
  return {
    total: Number(summary.total),
    pending: Number(summary.pending),
    approved: Number(summary.approved),
    rejected: Number(summary.rejected)
  };
}

async function listFormsForReview(req) {
  const current = await getCurrentUser(req);
  if (!current) await requirePerm(req, 'forms.review');
  const reviewer = current.role === 'HEAD'
    ? await requirePerm(req, 'forms.head-review')
    : await requirePerm(req, 'forms.review');
  const isHead = reviewer.role === 'HEAD';
  const summary = await getFormReviewSummary(reviewer);
  const [rows] = await pool.execute(
    `SELECT f.id, f.control_no, f.user_email, u.full_name AS applicant_name,
            f.template_key, f.form_data, f.status, f.review_stage, f.head_reviewer_email,
            f.head_signature, f.head_signed_by, f.head_signed_at, f.hr_signature, f.submitted_at,
            f.reviewed_by, f.reviewed_at, f.review_notes,
            COALESCE(NULLIF(reviewer.full_name, ''), 'HR/Admin') AS reviewed_by_name,
            reviewer.role AS reviewed_by_role
     FROM user_forms f
     LEFT JOIN user_roles u ON u.email = f.user_email
     LEFT JOIN user_roles reviewer ON reviewer.email = f.reviewed_by
     WHERE ${isHead
       ? 'f.head_reviewer_email = ?'
       : "(f.review_stage = 'HR' OR f.status IN ('APPROVED', 'REJECTED'))"}
     ORDER BY f.submitted_at DESC, f.id DESC LIMIT 500`,
    isHead ? [reviewer.email] : []);
  return {
    forms: rows.map(parseForm),
    summary
  };
}

async function getFormReviewSummaryForUser(req) {
  const current = await getCurrentUser(req);
  if (!current) await requirePerm(req, 'forms.review');
  if (current.role === 'STAFF' || current.role === 'USER') {
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
  const reviewer = current.role === 'HEAD'
    ? await requirePerm(req, 'forms.head-review')
    : await requirePerm(req, 'forms.review');
  return getFormReviewSummary(reviewer);
}

async function reviewUserForm(req, formId, decision, reason = '', signature = '') {
  const current = await getCurrentUser(req);
  if (!current) await requirePerm(req, 'forms.review');
  const isHead = current.role === 'HEAD';
  const reviewer = isHead
    ? await requirePerm(req, 'forms.head-review')
    : await requirePerm(req, 'forms.review');
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw httpError('Choose Approved or Rejected.', 400);
  }
  const reviewReason = decision === 'REJECTED' ? sanitize(reason) : '';
  if (decision === 'REJECTED' && !reviewReason) throw httpError('A reason is required to reject a form.', 400);
  if (String(reason || '').length > 500) throw httpError('The review reason must be 500 characters or fewer.', 400);
  validateApprovalSignature(isHead, decision, signature);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, control_no, status, review_stage, head_reviewer_email
       FROM user_forms WHERE id = ? FOR UPDATE`, [formId]);
    if (!rows.length) throw httpError('This form does not exist.', 404);
    if (rows[0].status !== 'PENDING') throw httpError('This form has already been reviewed.', 409);
    if (isHead) {
      if (rows[0].head_reviewer_email !== reviewer.email || rows[0].review_stage !== 'HEAD') {
        throw httpError('This form is not awaiting your signature.', 403);
      }
      if (decision === 'APPROVED') {
        await connection.execute(
          `UPDATE user_forms SET review_stage = 'HR', head_signature = ?, head_signed_by = ?,
             head_signed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [signature, reviewer.email, formId]);
        await logAudit(reviewer.email, 'FORM_HEAD_SIGNED', String(formId),
          `${rows[0].control_no} signed and forwarded to HR/Admin`, connection);
        await connection.commit();
        return { ok: true, status: 'PENDING', reviewStage: 'HR' };
      }
    } else if (rows[0].review_stage !== 'HR') {
      throw httpError('This form has not yet been forwarded by its assigned Head.', 409);
    }

    await connection.execute(
      `UPDATE user_forms SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
         review_notes = ?, hr_signature = ?
       WHERE id = ?`,
      [decision, reviewer.email, reviewReason, decision === 'APPROVED' ? signature : null, formId]);
    await logAudit(reviewer.email, 'FORM_REVIEWED', String(formId),
      `${rows[0].control_no} marked ${decision}`, connection);
    await connection.commit();
    return { ok: true, status: decision };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { LEAVE_TYPES, validateLeaveForm, validateUserForm, validateApprovalSignature, formatSerialNumber, currentSerialYear, canEditForm, listMyForms, submitLeaveForm, submitUserForm, updateMyForm, listFormsForReview, getFormReviewSummaryForUser, reviewUserForm };
