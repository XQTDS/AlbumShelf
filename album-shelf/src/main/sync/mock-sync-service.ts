import { SyncService, NeteaseAlbum } from './sync-service'

/**
 * Mock 种子数据：15 条真实专辑，覆盖不同年代、风格和艺术家
 * netease_album_id 和 netease_original_id 均为网易云音乐真实 ID
 */
const MOCK_ALBUMS: NeteaseAlbum[] = [
  {
    netease_album_id: '439E80AEE95BE3A45DDAABC9DF5D7CFA',
    netease_original_id: 34738739,
    title: 'IV',
    artist: 'BADBADNOTGOOD',
    cover_url: 'https://p1.music.126.net/placeholder/IV.jpg',
    release_date: '1997-06-16',
    track_count: 12
  },
  {
    netease_album_id: '9077220C672889E105D6F8FCC420B144',
    netease_original_id: 2060534,
    title: 'OK Computer',
    artist: 'Radiohead',
    cover_url: 'https://p1.music.126.net/placeholder/ok-computer.jpg',
    release_date: '1997-06-16',
    track_count: 12
  },
  {
    netease_album_id: 'FBB25C7A59E8B4646524DB0DC2A3BBF4',
    netease_original_id: 437968,
    title: 'Abbey Road',
    artist: 'The Beatles',
    cover_url: 'https://p1.music.126.net/placeholder/abbey-road.jpg',
    release_date: '1969-09-26',
    track_count: 17
  },
  {
    netease_album_id: '50E39FB7C62E9AA3EC1E59F7B4DA0022',
    netease_original_id: 428503,
    title: 'The Dark Side of the Moon',
    artist: 'Pink Floyd',
    cover_url: 'https://p1.music.126.net/placeholder/dark-side.jpg',
    release_date: '1973-03-01',
    track_count: 10
  },
  {
    netease_album_id: '4F728A7263695749390EEAE3A4454C26',
    netease_original_id: 1967971,
    title: 'Nevermind',
    artist: 'Nirvana',
    cover_url: 'https://p1.music.126.net/placeholder/nevermind.jpg',
    release_date: '1991-09-24',
    track_count: 13
  },
  {
    netease_album_id: '7064F9E4918CA411F3ECF7B6F9BF1709',
    netease_original_id: 1970278,
    title: 'Kind of Blue',
    artist: 'Miles Davis',
    cover_url: 'https://p1.music.126.net/placeholder/kind-of-blue.jpg',
    release_date: '1959-08-17',
    track_count: 5
  },
  {
    netease_album_id: '95EB25633371E874DB52B11F25574BC2',
    netease_original_id: 2462086,
    title: 'Random Access Memories',
    artist: 'Daft Punk',
    cover_url: 'https://p1.music.126.net/placeholder/ram.jpg',
    release_date: '2013-05-17',
    track_count: 13
  },
  {
    netease_album_id: 'E46EF40EA66D5B1ACBF84C0F2C52CB0B',
    netease_original_id: 18915,
    title: '范特西',
    artist: '周杰伦',
    cover_url: 'https://p1.music.126.net/placeholder/fantasy.jpg',
    release_date: '2001-09-14',
    track_count: 10
  },
  {
    netease_album_id: '83CDDE34C5410CDA00C95E08CF89B8FB',
    netease_original_id: 18905,
    title: '叶惠美',
    artist: '周杰伦',
    cover_url: 'https://p1.music.126.net/placeholder/ye-hui-mei.jpg',
    release_date: '2003-07-31',
    track_count: 11
  },
  {
    netease_album_id: '459F5D5A9E5D6F08B1A5386B20D82371',
    netease_original_id: 71710398,
    title: 'Is This It',
    artist: 'The Strokes',
    cover_url: 'https://p1.music.126.net/placeholder/is-this-it.jpg',
    release_date: '2001-07-30',
    track_count: 11
  },
  {
    netease_album_id: 'B013380F1EF39588858B73B9C9BE8448',
    netease_original_id: 1609276,
    title: 'Homework',
    artist: 'Daft Punk',
    cover_url: 'https://p1.music.126.net/placeholder/homework.jpg',
    release_date: '1997-01-20',
    track_count: 16
  },
  {
    netease_album_id: 'D52E81AD8190C096971F827E7A321C01',
    netease_original_id: 2065424,
    title: 'Kid A',
    artist: 'Radiohead',
    cover_url: 'https://p1.music.126.net/placeholder/kid-a.jpg',
    release_date: '2000-10-02',
    track_count: 10
  },
  {
    netease_album_id: 'CAB23E2DA635B1AA861FEEBBE6B65155',
    netease_original_id: 1637054,
    title: 'Rumours',
    artist: 'Fleetwood Mac',
    cover_url: 'https://p1.music.126.net/placeholder/rumours.jpg',
    release_date: '1977-02-04',
    track_count: 11
  },
  {
    netease_album_id: 'A754D548535B1F36A143F0F24EF44353',
    netease_original_id: 3109151,
    title: 'To Pimp a Butterfly',
    artist: 'Kendrick Lamar',
    cover_url: 'https://p1.music.126.net/placeholder/tpab.jpg',
    release_date: '2015-03-15',
    track_count: 16
  },
  {
    netease_album_id: 'D1378A8B04B60F657B562C515F51D330',
    netease_original_id: 428486,
    title: 'Wish You Were Here',
    artist: 'Pink Floyd',
    cover_url: 'https://p1.music.126.net/placeholder/wish-you-were-here.jpg',
    release_date: '1975-09-12',
    track_count: 5
  },
  {
    netease_album_id: '568BCF883A549172505F3A37CD36F6BC',
    netease_original_id: 1720842,
    title: 'In Rainbows',
    artist: 'Radiohead',
    cover_url: 'https://p1.music.126.net/placeholder/in-rainbows.jpg',
    release_date: '2007-10-10',
    track_count: 10
  }
]

/**
 * MockSyncService - 使用预设种子数据模拟网易云同步
 *
 * 返回 15 条真实专辑数据，覆盖：
 * - 年代：1959 ~ 2015
 * - 风格：摇滚、电子、爵士、说唱、华语流行
 * - 艺术家：Radiohead(3)、Pink Floyd(2)、Daft Punk(2)、周杰伦(2) 等
 */
export class MockSyncService implements SyncService {
  async fetchCollectedAlbums(): Promise<NeteaseAlbum[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500))
    return [...MOCK_ALBUMS]
  }

  async checkLoginStatus(): Promise<boolean> {
    // Mock always returns logged in
    return true
  }
}