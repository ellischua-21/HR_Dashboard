require('dotenv').config();

const { pool, initializeDatabase } = require('../server/db/database');
const { LISTS } = require('../server/config/Config');
const { importEmployees } = require('../server/services/ImportService');
const { requirePerm } = require('../server/middleware/Auth');
const { logAudit } = require('../server/services/AuditService');

function makeSampleRows(count) {
  const lists = LISTS;
  let seed = 42;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = items => items[Math.floor(random() * items.length)];
  const day = (startYear, endYear) => {
    const value = new Date(Date.UTC(
      startYear + Math.floor(random() * (endYear - startYear)),
      Math.floor(random() * 12), 1 + Math.floor(random() * 28)));
    return value.toISOString().slice(0, 10);
  };
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    const status = random() < 0.85 ? 'Active' : pick(['Resigned', 'Terminated', 'Inactive', 'Probationary']);
    return {
      last_name: 'Sample',
      first_name: 'Employee ' + number,
      middle_name: 'X',
      emp_no: 'SAMPLE-' + number,
      company: pick(lists.Company_List),
      location: pick(lists.Location_List),
      position: pick(lists.Position_List),
      department: pick(lists.Department_List),
      rank: pick(lists.Employee_Rank_List),
      date_employed: day(2012, 2026),
      status,
      birthday: day(1968, 2002),
      gender: pick(lists.Gender_List),
      civil_status: pick(lists.Civil_Status_List),
      education: pick(lists.Education_Level_List),
      function_type: pick(lists.Function_Type_List),
      hmo: pick(lists.HMO_Provider_List),
      fte: random() < 0.9 ? 1 : 0.5,
      email: 'sample' + number + '@example.com',
      tin: '000-000-' + number,
      sss: '00-0000' + number + '-0',
      pagibig: '0000-0000-' + number,
      philhealth: '00-000000' + number + '-0',
      _line: index + 2
    };
  });
}

async function main() {
  await initializeDatabase();
  const action = process.argv[2];
  const email = String(process.argv[3] || '').trim().toLowerCase();
  const req = { session: { userEmail: email } };
  if (action === 'generate') {
    const count = Math.max(1, Math.min(Number(process.argv[4]) || 60, 500));
    const result = await importEmployees(req, makeSampleRows(count), true);
    console.log(`Imported ${result.imported} of ${result.total} sample employee(s).`);
    if (result.errors.length) console.log(JSON.stringify(result.errors.slice(0, 5)));
  } else if (action === 'archive') {
    const user = await requirePerm(req, 'emp.archive');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        "UPDATE employees SET record_status = 'Archived' WHERE emp_no LIKE 'SAMPLE-%' AND record_status <> 'Archived'");
      await logAudit(user.email, 'ARCHIVE', '', 'Sample data archived: ' + result.affectedRows, connection);
      await connection.commit();
      console.log(`Archived ${result.affectedRows} sample employee(s).`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } else {
    throw new Error('Usage: npm run sample-data -- generate|archive admin@example.com [count]');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
