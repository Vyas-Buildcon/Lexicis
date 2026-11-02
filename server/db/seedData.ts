import { User, Hearing } from '../../src/types';

/** Demo accounts written to a brand-new database (login is restricted to the admin account). */
export const MOCK_USERS: { user: User; password: string }[] = [
  {
    user: {
      id: "attorney-1",
      email: "attorney@court.com",
      name: "Advocate 1",
      role: 'attorney',
      phone: "+91 98765 43210",
      profession: "Senior Legal Counsel",
      address: "Chamber 405, High Court Block, New Delhi",
      firmName: "A. Consultancy & Partners"
    },
    password: "password123"
  },
  {
    user: {
      id: "client-1",
      email: "client@gmail.com",
      name: "Client1",
      role: 'client',
      phone: "+91 91234 56789",
      profession: "Real Estate Developer",
      address: "102 Sharma Towers, MG Road, Mumbai"
    },
    password: "password123"
  }
];

/** Scheduled hearings seeded when the database has none. */
export const DEFAULT_HEARINGS: Hearing[] = [
  {
    id: "h-real-1",
    caseId: "MHPU010045212023",
    caseTitle: "Godrej Properties Ltd. vs. Rambhau Kisan Bhosale & Ors.",
    title: "Hearing on Injunction & Framing of Issues",
    date: "2026-10-14",
    time: "11:30 AM",
    courtRoom: "Court Hall No. 4, Shivajinagar Pune",
    description: "Arguments on maintainability of Exh. 5 injunction application and framing of specific performance issues regarding Kharadi Survey No. 46/1E/2.",
    status: "upcoming"
  },
  {
    id: "h-real-2",
    caseId: "MHPU010089122022",
    caseTitle: "Rohan Builders & Developers Pvt. Ltd. vs. Anandrao Tukaram Patil & Ors.",
    title: "Final Arguments & Court Commissioner Report",
    date: "2026-10-21",
    time: "02:30 PM",
    courtRoom: "Court Hall No. 7, District Court Pune",
    description: "Hearing on objections to TILR Court Commissioner joint measurement map regarding Baner Survey Nos. 156, 157, 158.",
    status: "upcoming"
  },
  {
    id: "h-real-3",
    caseId: "MHPU020023412024",
    caseTitle: "Sunil Jagannath Chavad & Anil Jagannath Chavad vs. PMC",
    title: "Verification of Compensation & Objection Report",
    date: "2026-11-05",
    time: "11:00 AM",
    courtRoom: "Court Hall No. 12, Shivajinagar Pune",
    description: "Verification of statutory title search public notice published in Dainik Prabhat and PMC valuation report for Wadgaon Khurd Survey 58/3 & 58/4.",
    status: "upcoming"
  },
  {
    id: "h-real-4",
    caseId: "MHPU010012452024",
    caseTitle: "Jyoti Sarkar & Ors. vs. Purbi Sarkar",
    title: "Heirship Certificate Grant Hearing",
    date: "2026-10-18",
    time: "12:00 PM",
    courtRoom: "Court Hall No. 19, Shivajinagar Court Pune",
    description: "Scrutiny of newspaper publication of notice under Bombay Regulation VIII of 1827 for Destination Hinjawadi Unit E-10, CTS 221/A 6.",
    status: "upcoming"
  }
];
