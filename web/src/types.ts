export interface Author {
  id: string;
  name: string;
  role: 'doctor' | 'student';
  headline: string | null;
  verified: boolean;
  avatarUrl: string | null;
}

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;
  name: string;
  email?: string;
  role: 'doctor' | 'student';
  isAdmin?: boolean;
  headline: string | null;
  specialization: string | null;
  qualifications: string | null;
  institution: string | null;
  location: string | null;
  bio: string | null;
  experienceYears: number | null;
  course: string | null;
  studyYear: number | null;
  avatarUrl: string | null;
  verificationStatus: VerificationStatus;
  followerCount: number;
  followingCount: number;
  following?: boolean;
}

export interface Poll {
  options: { label: string; votes: number }[];
  total: number;
  myVote: number | null;
}

export interface Post {
  id: string;
  seq: string;
  kind: 'update' | 'case_poll' | 'link';
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  liked: boolean;
  author: Author;
  poll: Poll | null;
}

export interface Comment {
  id: string;
  seq: string;
  body: string;
  createdAt: string;
  author: Author;
}

export interface Clip {
  id: string;
  seq: string;
  caption: string;
  videoUrl: string;
  category: 'clinical' | 'social' | 'education';
  likeCount: number;
  liked: boolean;
  createdAt: string;
  author: Author;
}

export type OpportunityKind = 'job' | 'research' | 'freelance' | 'course' | 'event' | 'community';

export interface Opportunity {
  id: string;
  seq: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  location: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  description: string;
  eventDate: string | null;
  contact: string | null;
  applyUrl: string | null;
  createdAt: string;
  postedBy: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
