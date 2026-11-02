import { Car, CreditCard, Home, Briefcase, LucideIcon } from 'lucide-react';

export interface PresetScenario {
  label: string;
  icon: LucideIcon;
  type: string;
  role: string;
  details: string;
  actions: string;
  goals: string;
}

/** Example incidents that pre-fill the strategy form. */
export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    label: '🚗 Car Collision & Scooter Injury',
    icon: Car,
    type: 'Motor Vehicle Accident / Road Collision',
    role: 'At Fault / Caused Incident',
    details: 'Yesterday night around 9:30 PM, I hit a scooter while taking a right turn. The rider fell down and suffered a leg fracture, and his scooter headlight/visor was damaged. I stayed at the scene, helped him into an auto to go to hospital, and exchanged phone numbers. I didn\'t call the police immediately because I got panicked. Today his brother called me threatening to lodge an FIR under Section 279/338. I want to handle this legally, cover his hospital bills and repair charges, and avoid a police case.',
    actions: 'Stayed at scene, arranged transport to hospital, exchanged phone numbers, took photos of my car bumper.',
    goals: 'Pay all medical & scooter repair costs out-of-court, get a signed NOC/Compromise Deed, avoid police arrest or FIR.'
  },
  {
    label: '💰 Cheque Bounce / Sec 138 Notice',
    icon: CreditCard,
    type: 'Financial / Cheque Bounce / Debt Dispute',
    role: 'At Fault / Caused Incident',
    details: 'My business vendor presented a cheque of ₹2.5 Lakhs which bounced due to insufficient funds in my account. Yesterday I received a formal 15-day Statutory Legal Notice under Section 138 of Negotiable Instruments Act. I want to clear the debt in 3 monthly installments, but the vendor is threatening to file a criminal court complaint immediately.',
    actions: 'Received statutory notice yesterday via registered post.',
    goals: 'Reply formally to notice, restructure payment into 3 installments, compound debt without criminal court trial.'
  },
  {
    label: '📜 Tenant Eviction & Deposit Dispute',
    icon: Home,
    type: 'Property / Landlord & Tenant Dispute',
    role: 'Victim / Damaged Party',
    details: 'My landlord suddenly cut off electricity and water supply to my rented apartment without notice and is threatening to forcefully throw my belongings out tomorrow. He refuses to return my ₹1.2 Lakh security deposit claiming fake painting charges.',
    actions: 'Sent WhatsApp messages requesting electricity restoration, kept deposit bank receipt.',
    goals: 'Restore utility supply immediately, stop illegal eviction, recover security deposit legally.'
  },
  {
    label: '💼 Workplace Legal Notice / Non-Compete',
    icon: Briefcase,
    type: 'Employment / Contractual Dispute',
    role: 'Unintentional Contributor',
    details: 'My former employer sent a legal notice alleging I violated a 1-year non-compete clause by joining a competitor firm. They are demanding ₹5 Lakhs in damages and threatening an injunction.',
    actions: 'Shared copy of my employment offer letter with legal advisor.',
    goals: 'Defend against non-compete notice based on Section 27 Contract Act, resolve without court injunction.'
  }
];
