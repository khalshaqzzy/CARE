import { videoSource } from './GuidePage';

describe('videoSource', () => {
  it.each([
    ['https://youtu.be/abc', 'YouTube'],
    ['https://www.youtube.com/watch?v=abc', 'YouTube'],
    ['https://m.youtube.com/watch?v=abc', 'YouTube'],
    ['https://drive.google.com/file/d/x/view', 'Google Drive'],
    ['https://toyota.sharepoint.com/sites/care/video.mp4', 'SharePoint'],
  ])('names the host of %s', (url, label) => {
    expect(videoSource(url)).toBe(label);
  });

  it('shows look-alike hosts as they are', () => {
    expect(videoSource('https://evilyoutube.com/watch')).toBe('evilyoutube.com');
    expect(videoSource('https://notsharepoint.com/x')).toBe('notsharepoint.com');
  });

  it('falls back to Link for a malformed URL', () => {
    expect(videoSource('not a url')).toBe('Link');
  });
});
