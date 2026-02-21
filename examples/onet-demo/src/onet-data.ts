/**
 * Embedded O*NET-style occupational data.
 *
 * Structure mirrors the O*NET Web Services API responses:
 *   https://services.onetcenter.org/reference/
 *
 * Codes follow the Standard Occupational Classification (SOC) system.
 */

export interface OnetOccupation {
  code: string;
  title: string;
  description: string;
  bright_outlook: boolean;
  green: boolean;
  in_demand: boolean;
  tasks: string[];
  skills: Array<{ name: string; level: number }>; // level 0–100
  knowledge: Array<{ name: string; level: number }>;
  work_styles: string[];
  education: string;
  median_wage: number; // USD / year
  employment: number; // estimated national employment
  outlook: 'Much faster than average' | 'Faster than average' | 'Average' | 'Slower than average';
  tags: string[];
}

export const OCCUPATIONS: OnetOccupation[] = [
  {
    code: '15-1252.00',
    title: 'Software Developers',
    description:
      'Research, design, and develop computer and network software or specialized utility programs. Analyze user needs and develop software solutions, applying principles and techniques of computer science, engineering, and mathematical analysis.',
    bright_outlook: true,
    green: false,
    in_demand: true,
    tasks: [
      'Analyze information to determine, recommend, and plan computer specifications and layouts.',
      'Modify existing software to correct errors, allow it to adapt to new hardware, or to improve its performance.',
      'Develop and direct software system testing and validation procedures.',
      'Consult with customers about software system design and maintenance.',
      'Direct software programming and development of documentation.',
    ],
    skills: [
      { name: 'Programming', level: 87 },
      { name: 'Critical Thinking', level: 80 },
      { name: 'Systems Analysis', level: 76 },
      { name: 'Complex Problem Solving', level: 75 },
      { name: 'Active Listening', level: 62 },
    ],
    knowledge: [
      { name: 'Computers and Electronics', level: 93 },
      { name: 'Engineering and Technology', level: 75 },
      { name: 'Mathematics', level: 70 },
      { name: 'English Language', level: 62 },
    ],
    work_styles: ['Attention to Detail', 'Analytical Thinking', 'Innovation', 'Cooperation'],
    education: "Bachelor's degree",
    median_wage: 132_270,
    employment: 1_847_900,
    outlook: 'Much faster than average',
    tags: ['technology', 'software', 'engineering', 'developer'],
  },
  {
    code: '15-1211.00',
    title: 'Computer Systems Analysts',
    description:
      'Analyse science, engineering, business, and other data processing problems to develop and implement solutions to complex applications problems, system administration issues, or network concerns.',
    bright_outlook: true,
    green: false,
    in_demand: true,
    tasks: [
      'Expand or modify existing systems to serve new purposes or improve workflow.',
      'Interview or survey workers, observe job performance, or perform the job to determine job requirements.',
      'Prepare reports and cost-benefit analyses for management.',
      'Consult with management to ensure agreement on system principles.',
    ],
    skills: [
      { name: 'Systems Analysis', level: 82 },
      { name: 'Critical Thinking', level: 78 },
      { name: 'Active Listening', level: 72 },
      { name: 'Complex Problem Solving', level: 70 },
      { name: 'Reading Comprehension', level: 68 },
    ],
    knowledge: [
      { name: 'Computers and Electronics', level: 88 },
      { name: 'Customer and Personal Service', level: 70 },
      { name: 'Administration and Management', level: 65 },
      { name: 'English Language', level: 65 },
    ],
    work_styles: ['Analytical Thinking', 'Attention to Detail', 'Cooperation', 'Integrity'],
    education: "Bachelor's degree",
    median_wage: 102_240,
    employment: 609_900,
    outlook: 'Faster than average',
    tags: ['technology', 'systems', 'analysis', 'IT'],
  },
  {
    code: '15-2051.00',
    title: 'Data Scientists',
    description:
      'Develop and implement a set of techniques or analytics applications to transform raw data into meaningful information using data-oriented programming languages and visualization software.',
    bright_outlook: true,
    green: false,
    in_demand: true,
    tasks: [
      'Apply mathematical or statistical theory and methods to collect, organize, interpret, and summarize numerical data.',
      'Build, apply, and maintain machine learning models.',
      'Communicate findings or recommendations to management or stakeholders.',
      'Create graphs, charts, dashboards, or other visualizations to communicate results.',
    ],
    skills: [
      { name: 'Programming', level: 82 },
      { name: 'Mathematics', level: 80 },
      { name: 'Critical Thinking', level: 78 },
      { name: 'Complex Problem Solving', level: 76 },
      { name: 'Statistics', level: 85 },
    ],
    knowledge: [
      { name: 'Mathematics', level: 88 },
      { name: 'Computers and Electronics', level: 85 },
      { name: 'Statistics', level: 87 },
      { name: 'English Language', level: 62 },
    ],
    work_styles: ['Analytical Thinking', 'Innovation', 'Attention to Detail', 'Persistence'],
    education: "Bachelor's degree (Master's common)",
    median_wage: 108_020,
    employment: 168_900,
    outlook: 'Much faster than average',
    tags: ['data', 'machine learning', 'AI', 'statistics', 'analytics'],
  },
  {
    code: '11-3021.00',
    title: 'Computer and Information Systems Managers',
    description:
      'Plan, direct, or coordinate activities in such fields as electronic data processing, information systems, systems analysis, and computer programming.',
    bright_outlook: true,
    green: false,
    in_demand: true,
    tasks: [
      'Direct daily operations of department, analyzing workflow, establishing priorities.',
      'Develop computer information resources, providing for data security and control.',
      'Meet with department heads, managers, supervisors, vendors, and others.',
      'Review project plans to plan and coordinate project activity.',
    ],
    skills: [
      { name: 'Management of Personnel Resources', level: 78 },
      { name: 'Coordination', level: 75 },
      { name: 'Critical Thinking', level: 73 },
      { name: 'Speaking', level: 70 },
      { name: 'Monitoring', level: 70 },
    ],
    knowledge: [
      { name: 'Computers and Electronics', level: 82 },
      { name: 'Administration and Management', level: 80 },
      { name: 'Customer and Personal Service', level: 70 },
      { name: 'Economics and Accounting', level: 64 },
    ],
    work_styles: ['Leadership', 'Integrity', 'Cooperation', 'Stress Tolerance'],
    education: "Bachelor's degree",
    median_wage: 169_510,
    employment: 530_200,
    outlook: 'Much faster than average',
    tags: ['management', 'IT', 'leadership', 'CIO', 'technology'],
  },
  {
    code: '29-1141.00',
    title: 'Registered Nurses',
    description:
      'Assess patient health problems and needs, develop and implement nursing care plans, and maintain medical records. Administer nursing care to ill, injured, convalescent, or disabled patients.',
    bright_outlook: true,
    green: false,
    in_demand: true,
    tasks: [
      'Maintain accurate, detailed reports and records.',
      'Monitor, record, and report symptoms or changes in patients conditions.',
      'Record patients medical information and vital signs.',
      'Order, interpret, and evaluate diagnostic tests to identify and assess patient condition.',
    ],
    skills: [
      { name: 'Social Perceptiveness', level: 78 },
      { name: 'Active Listening', level: 76 },
      { name: 'Critical Thinking', level: 74 },
      { name: 'Service Orientation', level: 72 },
      { name: 'Monitoring', level: 70 },
    ],
    knowledge: [
      { name: 'Medicine and Dentistry', level: 85 },
      { name: 'Psychology', level: 72 },
      { name: 'Customer and Personal Service', level: 70 },
      { name: 'Biology', level: 68 },
    ],
    work_styles: ['Concern for Others', 'Stress Tolerance', 'Integrity', 'Attention to Detail'],
    education: "Bachelor's degree (Associate's accepted in some settings)",
    median_wage: 81_220,
    employment: 3_237_400,
    outlook: 'Faster than average',
    tags: ['healthcare', 'nursing', 'medicine', 'hospital'],
  },
  {
    code: '17-2141.00',
    title: 'Mechanical Engineers',
    description:
      'Perform engineering duties in planning and designing tools, engines, machines, and other mechanically functioning equipment. Oversee installation, operation, maintenance, and repair of equipment.',
    bright_outlook: false,
    green: true,
    in_demand: false,
    tasks: [
      'Read and interpret blueprints, technical drawings, schematics, or computer-generated reports.',
      'Research, design, evaluate, install, operate, or maintain mechanical products, equipment, systems or processes.',
      'Develop and test models of alternate designs and processing methods to assess feasibility.',
      'Recommend design modifications to eliminate machine or system malfunctions.',
    ],
    skills: [
      { name: 'Systems Analysis', level: 75 },
      { name: 'Critical Thinking', level: 75 },
      { name: 'Mathematics', level: 72 },
      { name: 'Complex Problem Solving', level: 70 },
      { name: 'Active Learning', level: 66 },
    ],
    knowledge: [
      { name: 'Engineering and Technology', level: 90 },
      { name: 'Physics', level: 82 },
      { name: 'Mathematics', level: 78 },
      { name: 'Design', level: 74 },
    ],
    work_styles: ['Attention to Detail', 'Analytical Thinking', 'Dependability', 'Innovation'],
    education: "Bachelor's degree",
    median_wage: 99_510,
    employment: 310_900,
    outlook: 'Average',
    tags: ['engineering', 'mechanical', 'manufacturing', 'design'],
  },
  {
    code: '25-2021.00',
    title: 'Elementary School Teachers',
    description:
      'Teach academic and social skills to students at the elementary school level. Except special and career/technical education teachers.',
    bright_outlook: false,
    green: false,
    in_demand: false,
    tasks: [
      'Prepare course objectives and outline for course of study following curriculum guidelines.',
      'Observe and evaluate students academic and social development.',
      'Plan and conduct activities for a balanced program of instruction, demonstration, and work time.',
      'Prepare materials and classrooms for class activities.',
    ],
    skills: [
      { name: 'Instructing', level: 78 },
      { name: 'Speaking', level: 76 },
      { name: 'Active Listening', level: 74 },
      { name: 'Learning Strategies', level: 70 },
      { name: 'Monitoring', level: 68 },
    ],
    knowledge: [
      { name: 'Education and Training', level: 86 },
      { name: 'English Language', level: 75 },
      { name: 'Psychology', level: 68 },
      { name: 'Mathematics', level: 62 },
    ],
    work_styles: ['Concern for Others', 'Cooperation', 'Self Control', 'Dependability'],
    education: "Bachelor's degree + state certification",
    median_wage: 61_620,
    employment: 1_474_200,
    outlook: 'Average',
    tags: ['education', 'teaching', 'school', 'children'],
  },
  {
    code: '13-2011.00',
    title: 'Accountants and Auditors',
    description:
      'Examine, analyze, and interpret accounting records to prepare financial statements, give advice, or audit and evaluate statements prepared by others.',
    bright_outlook: false,
    green: false,
    in_demand: false,
    tasks: [
      'Prepare, examine, or analyze accounting records, financial statements.',
      'Establish tables of accounts and assign entries to proper accounts.',
      'Compute taxes owed and prepare tax returns, ensuring compliance.',
      'Advise clients in areas such as compensation, employee health care benefits.',
    ],
    skills: [
      { name: 'Mathematics', level: 72 },
      { name: 'Critical Thinking', level: 70 },
      { name: 'Reading Comprehension', level: 68 },
      { name: 'Active Listening', level: 64 },
      { name: 'Writing', level: 62 },
    ],
    knowledge: [
      { name: 'Economics and Accounting', level: 90 },
      { name: 'Mathematics', level: 72 },
      { name: 'English Language', level: 68 },
      { name: 'Law and Government', level: 64 },
    ],
    work_styles: ['Attention to Detail', 'Integrity', 'Dependability', 'Analytical Thinking'],
    education: "Bachelor's degree (CPA requires 150 credit hours)",
    median_wage: 79_880,
    employment: 1_517_500,
    outlook: 'Average',
    tags: ['finance', 'accounting', 'audit', 'CPA', 'tax'],
  },
];

/** Search occupations by keyword (title, description, tags). */
export function searchOccupations(keyword: string): OnetOccupation[] {
  const q = keyword.toLowerCase();
  return OCCUPATIONS.filter(
    (o) =>
      o.title.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      o.tags.some((t) => t.includes(q)),
  );
}

/** Find an occupation by SOC code. */
export function getOccupation(code: string): OnetOccupation | undefined {
  return OCCUPATIONS.find((o) => o.code === code);
}
