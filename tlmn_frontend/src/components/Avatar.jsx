/**
 * Nội dung bên trong khung avatar TRÒN (khung tròn do nơi dùng cung cấp):
 *  - có ảnh đại diện -> hiện ảnh (đã crop vuông)
 *  - người thật chưa có ảnh -> hình bóng (silhouette) xám theo giới tính, mặc định Nam
 *  - Bot hoặc chỉ có chữ -> hiện chữ (số thứ tự Bot / chữ cái đầu)
 */
export function Silhouette({ gender = 'male', className = '' }) {
  const female = gender === 'female';
  return (
    <svg className={`tl-silhouette ${className}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" fill="#d3d6db" />
      {female && (
        <path
          d="M26 46 C26 22 37 15 50 15 C63 15 74 22 74 46 L77 72 C77 77 72 79 69 76 L31 76 C28 79 23 77 23 72 Z"
          fill="#6f757d"
        />
      )}
      <circle cx="50" cy={female ? 40 : 38} r={female ? 14.5 : 16.5} fill="#8f959d" />
      <path
        d={female ? 'M21 100 C21 77 34 65 50 65 C66 65 79 77 79 100 Z' : 'M16 100 C16 75 32 62 50 62 C68 62 84 75 84 100 Z'}
        fill="#8f959d"
      />
    </svg>
  );
}

export default function Avatar({ profile, letter, human = true }) {
  if (profile?.avatar) {
    return <img className="tl-avatar-img" src={profile.avatar} alt="" draggable={false} />;
  }
  if (human && !letter) return <Silhouette gender={profile?.gender} />;
  if (human && profile) return <Silhouette gender={profile.gender} />;
  return <span aria-hidden="true">{letter}</span>;
}
