const CFG = {
  APP_NAME: 'HR Management System',
  PAGE_SIZE: 25
};

const LISTS = {
  Company_List: ['Company A', 'Company B'],
  Department_List: ['Human Resources', 'Finance', 'Operations', 'IT', 'Sales'],
  Location_List: ['Head Office', 'Branch 1'],
  Position_List: ['Staff', 'Supervisor', 'Manager'],
  Employee_Rank_List: ['Rank and File', 'Supervisory', 'Managerial', 'Executive'],
  Employment_Status_List: ['Active', 'Probationary', 'Contractual', 'Resigned', 'Terminated', 'Retired', 'Inactive'],
  HMO_Provider_List: ['PhilCare', 'Maxicare'],
  Education_Level_List: ['High School', 'Vocational', 'Bachelor', 'Master', 'Doctorate'],
  Function_Type_List: ['Direct', 'Indirect', 'Support'],
  Civil_Status_List: ['Single', 'Married', 'Widowed', 'Separated'],
  Gender_List: ['Female', 'Male', 'Other'],
  YesNo_List: ['Yes', 'No']
};

// [key, label, type, flags, lookup-list]; flags: R=required, S=sensitive, C=calculated, U=unique, O=optional.
const EMP_FIELDS = [
  ['record_id', 'Record ID', 'text', 'C'],
  ['seq_no', 'No.', 'number', 'C'],
  ['name', 'Name of Employee', 'text', 'C'],
  ['emp_no', 'Employee Number', 'text', 'RU'],
  ['company', 'Company Name', 'list', 'R', 'Company_List'],
  ['location', 'Work Location', 'list', 'R', 'Location_List'],
  ['position', 'Current Position', 'text', 'R'],
  ['department', 'Department', 'list', 'R', 'Department_List'],
  ['rank', 'Employee Rank', 'list', 'R', 'Employee_Rank_List'],
  ['reports_to', 'Reports To', 'text', ''],
  ['date_employed', 'Date of Employment', 'date', 'R'],
  ['status', 'Employment Status', 'list', 'R', 'Employment_Status_List'],
  ['address', 'Current Residential Address', 'text', 'S'],
  ['network', 'Network', 'text', ''],
  ['birthday', 'Birthday', 'date', 'RS'],
  ['civil_status', 'Civil Status', 'list', '', 'Civil_Status_List'],
  ['personal_email', 'Personal Email', 'email', ''],
  ['contact_no', 'Mobile Number', 'text', 'S'],
  ['company_contact_no', 'Company Contact Number', 'text', ''],
  ['hmo', 'HMO Provider', 'list', '', 'HMO_Provider_List'],
  ['tin', 'TIN', 'text', 'S'],
  ['pagibig', 'Pag-IBIG Number', 'text', 'S'],
  ['sss', 'SSS Number', 'text', 'S'],
  ['philhealth', 'PhilHealth Number', 'text', 'S'],
  ['gov_deduction', 'Government Contributions Deduction', 'number', 'S'],
  ['emergency_name', 'Emergency Contact Name', 'text', 'S'],
  ['emergency_no', 'Emergency Contact No.', 'text', 'S'],
  ['transfer_eff', 'Effectivity of Transfer', 'date', ''],
  ['salary_structure', 'Salary Structure', 'text', 'S'],
  ['education', 'Education Level', 'list', '', 'Education_Level_List'],
  ['gender', 'Gender', 'list', '', 'Gender_List'],
  ['function_type', 'Function Type', 'list', '', 'Function_Type_List'],
  ['fte', 'FTE Allocation', 'number', 'R'],
  ['docs', 'Supporting Documents', 'text', 'S'],
  ['record_status', 'Record Status', 'text', 'C'],
  ['created_at', 'Date Created', 'date', 'C'],
  ['created_by', 'Created By', 'text', 'C'],
  ['modified_at', 'Last Modified', 'date', 'C'],
  ['modified_by', 'Modified By', 'text', 'C'],
  ['last_name', 'Last Name', 'text', 'R'],
  ['first_name', 'First Name', 'text', 'R'],
  ['middle_name', 'Middle Name', 'text', 'O'],
  ['birth_place', 'Birth Place', 'text', 'SO'],
  ['permanent_address', 'Permanent Address', 'text', 'SO'],
  ['landline_no', 'Landline Number', 'text', 'SO'],
  ['father_name', "Father's Full Name", 'text', 'SO'],
  ['father_occupation', "Father's Occupation", 'text', 'SO'],
  ['mother_maiden', "Mother's Maiden Name", 'text', 'SO'],
  ['mother_occupation', "Mother's Occupation", 'text', 'SO'],
  ['siblings', 'Siblings', 'json', 'SO'],
  ['spouse_name', 'Name of Spouse/Partner', 'text', 'SO'],
  ['children', 'Children', 'json', 'SO'],
  ['church_has', 'Position in Church?', 'list', 'SO', 'YesNo_List'],
  ['church_position', 'Church Position (if yes)', 'text', 'SO'],
  ['orgs', 'Organizations/Memberships', 'json', 'SO'],
  ['emergency_address', 'Emergency Contact Address', 'text', 'SO'],
  ['emergency_relationship', 'Emergency Contact Relationship', 'text', 'SO'],
  ['facebook', 'Facebook', 'text', 'SO'],
  ['instagram', 'Instagram', 'text', 'SO'],
  ['tiktok', 'TikTok', 'text', 'SO'],
  ['youtube', 'YouTube', 'text', 'SO'],
  ['twitter', 'Twitter/X', 'text', 'SO']
];

const F = {
  keys: () => EMP_FIELDS.map(f => f[0]),
  get: key => EMP_FIELDS.find(f => f[0] === key),
  has: (field, flag) => field[3].includes(flag)
};

const ROLE_PERMS = {
  ADMIN: ['dash.view', 'exec.view', 'emp.read', 'emp.write', 'emp.sensitive', 'emp.export', 'emp.archive', 'admin.manage', 'audit.read', 'report.run', 'forms.review', 'announcements.manage', 'inbox.read', 'account.password'],
  HR: ['dash.view', 'exec.view', 'emp.read', 'emp.write', 'emp.export', 'emp.archive', 'report.run', 'forms.self', 'forms.review', 'announcements.manage', 'inbox.read', 'account.password'],
  HEAD: ['forms.self', 'forms.head-review', 'announcements.read', 'inbox.read', 'account.password'],
  STAFF: ['forms.self', 'announcements.read', 'inbox.read', 'account.password']
};

const ACCOUNT_ROLE_MAP = {
  STAFF: 'STAFF',
  HEAD: 'HEAD',
  HR: 'HR',
  ADMIN: 'ADMIN'
};

const ACTIVE_STATUSES = ['Active', 'Probationary', 'Contractual'];
const AGE_BANDS = ['Under 25', '25-34', '35-44', '45-54', '55+', 'Unknown'];
const TENURE_BANDS = ['Under 1 yr', '1-<3 yrs', '3-<5 yrs', '5-<10 yrs', '10+ yrs'];

module.exports = { CFG, LISTS, EMP_FIELDS, F, ROLE_PERMS, ACCOUNT_ROLE_MAP, ACTIVE_STATUSES, AGE_BANDS, TENURE_BANDS };
