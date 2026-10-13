export const AUTHOR_COLUMNS = `
  u.id AS author_id, u.name AS author_name, u.role AS author_role,
  u.headline AS author_headline, u.specialization AS author_specialization,
  u.verification_status AS author_verification, u.avatar_url AS author_avatar`;

export function mapAuthor(r: any) {
  return {
    id: r.author_id,
    name: r.author_name,
    role: r.author_role,
    headline: r.author_headline ?? r.author_specialization ?? null,
    verified: r.author_verification === 'verified',
    avatarUrl: r.author_avatar ?? null,
  };
}

export function mapUser(r: any) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    isAdmin: r.is_admin,
    headline: r.headline,
    specialization: r.specialization,
    qualifications: r.qualifications,
    institution: r.institution,
    location: r.location,
    bio: r.bio,
    experienceYears: r.experience_years,
    course: r.course,
    studyYear: r.study_year,
    avatarUrl: r.avatar_url,
    verificationStatus: r.verification_status,
    followerCount: r.follower_count,
    followingCount: r.following_count,
    createdAt: r.created_at,
  };
}

/** Same as mapUser, but without the email address, for other people's profiles. */
export function mapPublicUser(r: any) {
  const { email: _email, isAdmin: _admin, ...rest } = mapUser(r);
  return rest;
}

export function mapPost(r: any, tallies: number[] | null) {
  const options: string[] | null = r.poll_options;
  const total = tallies ? tallies.reduce((a, b) => a + b, 0) : 0;
  return {
    id: r.id,
    seq: r.seq,
    kind: r.kind,
    body: r.body,
    imageUrl: r.image_url,
    linkUrl: r.link_url,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    createdAt: r.created_at,
    liked: !!r.liked,
    author: mapAuthor(r),
    poll: options
      ? { options: options.map((label, i) => ({ label, votes: tallies?.[i] ?? 0 })), total, myVote: r.my_vote ?? null }
      : null,
  };
}

export const mapOpportunity = (r: any) => ({
  id: r.id, seq: r.seq, kind: r.kind, title: r.title, organization: r.organization, location: r.location,
  employmentType: r.employment_type, experienceLevel: r.experience_level, description: r.description,
  eventDate: r.event_date, contact: r.contact, applyUrl: r.apply_url, createdAt: r.created_at,
  postedBy: r.created_by,
});
