// Preview data for the Time for Team design round; replaced by the API later.
export type TeamPhotoTone = 'sunrise' | 'leaf' | 'sky' | 'berry' | 'sand';
export type TeamPhotoScene = 'briefing' | 'meal' | 'sport' | 'award' | 'sharing';

export type TeamPost = {
  id: string;
  author: { name: string; role: string; unit: string };
  postedAt: string;
  caption: string;
  photos: { tone: TeamPhotoTone; scene: TeamPhotoScene }[];
  participants: number;
  likes: number;
  comments: number;
  liked?: boolean;
  mine?: boolean;
  firstComment?: { name: string; text: string };
};

export const TEAM_POSTS: TeamPost[] = [
  {
    id: 'p1',
    author: { name: 'Budi Santoso', role: 'Department Head', unit: 'Production Control' },
    postedAt: '2 jam lalu',
    caption: 'Senam pagi dan briefing safety bareng tim Line 2. Semangat awal minggu! 💪',
    photos: [
      { tone: 'sunrise', scene: 'sport' },
      { tone: 'sky', scene: 'briefing' },
      { tone: 'leaf', scene: 'sport' },
    ],
    participants: 18,
    likes: 12,
    comments: 4,
    mine: true,
    firstComment: { name: 'Dewi A.', text: 'Seru banget pak, minggu depan lagi ya!' },
  },
  {
    id: 'p2',
    author: { name: 'Rina Wulandari', role: 'Section Head', unit: 'Quality Assurance' },
    postedAt: 'Kemarin',
    caption: 'Makan siang bersama merayakan zero defect bulan September. Terima kasih tim QA! 🎉',
    photos: [{ tone: 'berry', scene: 'meal' }],
    participants: 9,
    likes: 24,
    comments: 7,
    liked: true,
  },
  {
    id: 'p3',
    author: { name: 'Agus Pratama', role: 'Group Leader', unit: 'Assembly' },
    postedAt: '3 hari lalu',
    caption: 'Sharing session K3: cara aman mengangkat beban berat di area assembly.',
    photos: [
      { tone: 'sand', scene: 'sharing' },
      { tone: 'sky', scene: 'award' },
    ],
    participants: 12,
    likes: 9,
    comments: 2,
  },
];
