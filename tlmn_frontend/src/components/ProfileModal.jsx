import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import AvatarCropper from './AvatarCropper';
import { MODES, MAX_NAME_LENGTH, displayNameOf, formatRate, saveProfile, winRate } from '../profileStore';
import { formatChip } from '../gameFlow';
import { formatPlayerId } from '../session';

const GENDERS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
];

const fullNumber = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

/**
 * Hồ sơ người chơi dạng THẺ CĂN CƯỚC (mở từ nút avatar tròn ở góc trên-trái menu).
 *  - Cột trái: khung avatar tròn (mặc định hình bóng xám Nam/Nữ). Bấm vào để chọn ảnh (ảnh chữ nhật
 *    cũng được) -> hiện công cụ kéo/zoom để chọn đúng phần hiển thị trong vòng tròn.
 *  - Cột phải: tên trong game (đổi được), giới tính, số dư, kỷ lục số dư, số ván và tỉ lệ thắng
 *    TÁCH RIÊNG theo 2 chế độ Đếm lá / Nhất ăn tất.
 * Dữ liệu đến từ Backend (login/update_profile); App làm tươi ngầm mỗi lần mở thẻ (onRefresh) nên
 * `profile` có thể đổi khi đang mở — nếu bạn CHƯA sửa gì thì ô nhập tự đồng bộ theo bản mới.
 * Thay đổi chỉ ghi lên Backend khi bấm "Lưu thay đổi".
 */
export default function ProfileModal({ auth, profile, onClose, onSaved, onRefresh }) {
  const [name, setName] = useState(profile.display_name || '');
  const [gender, setGender] = useState(profile.gender || 'male');
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);
  const synced = useRef({ name: profile.display_name || '', gender: profile.gender || 'male', avatar: profile.avatar || null });

  // Mở thẻ là làm tươi số dư + thống kê (đăng nhập ngầm); xong thì bỏ trạng thái "…".
  useEffect(() => {
    let alive = true;
    Promise.resolve(onRefresh?.()).finally(() => alive && setRefreshing(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hồ sơ đổi từ bên ngoài (làm tươi / vừa lưu): nếu người dùng chưa sửa gì thì cập nhật các ô nhập.
  useEffect(() => {
    const s = synced.current;
    if (name === s.name && gender === s.gender && avatar === s.avatar && !avatarChanged) {
      setName(profile.display_name || '');
      setGender(profile.gender || 'male');
      setAvatar(profile.avatar || null);
    }
    synced.current = { name: profile.display_name || '', gender: profile.gender || 'male', avatar: profile.avatar || null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !cropFile && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, cropFile]);

  const trimmed = name.trim();
  const dirty =
    (trimmed || auth.username) !== (profile.display_name || auth.username) || gender !== profile.gender || avatarChanged;

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng tệp đó lần nữa
    if (f) setCropFile(f);
  };

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setMessage(null);
    const res = await saveProfile({
      username: auth.username,
      password: auth.password,
      current: profile,
      patch: { displayName: name, gender, avatar: avatarChanged ? avatar || '' : undefined },
    });
    setSaving(false);
    if (res.error) {
      setMessage({ kind: 'error', text: res.error });
      return;
    }
    setAvatarChanged(false);
    setName(res.profile.display_name);
    setGender(res.profile.gender);
    setAvatar(res.profile.avatar);
    onSaved?.(res.profile);
    setMessage({ kind: 'ok', text: 'Đã lưu hồ sơ.' });
  };

  const view = { ...profile, avatar, gender };
  const shownName = trimmed || auth.username;
  const highest = Math.max(profile.highest_balance || 0, auth.balance || 0);
  const playerId = profile.player_id || auth.playerId;
  const dash = refreshing ? '…' : null;

  return (
    <div className="tl-modal" role="dialog" aria-modal="true" aria-label="Hồ sơ người chơi" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tl-idcard" data-testid="profile-card">
        <div className="tl-idcard__band">
          <span className="tl-idcard__band-title">Thẻ người chơi</span>
          <span className="tl-idcard__band-sub">Tiến Lên Miền Nam</span>
        </div>

        <div className="tl-idcard__body">
          <div className="tl-idcard__left">
            <button
              type="button"
              className="tl-idcard__photo"
              onClick={() => fileRef.current?.click()}
              aria-label="Đổi ảnh đại diện"
              data-testid="profile-photo"
            >
              <Avatar profile={view} />
              <span className="tl-idcard__photo-hint">Đổi ảnh</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} data-testid="profile-file" />
            {avatar && (
              <button
                type="button"
                className="tl-idcard__link"
                onClick={() => {
                  setAvatar(null);
                  setAvatarChanged(true);
                }}
                data-testid="profile-clear-photo"
              >
                Xoá ảnh
              </button>
            )}
            <p className="tl-idcard__id">
              <span>Tài khoản</span>
              <b>{auth.username}</b>
            </p>
          </div>

          <div className="tl-idcard__right">
            {playerId && (
              <div className="tl-idcard__no">
                <span className="tl-idcard__label">ID người chơi</span>
                <span className="tl-idno tl-idno--sm" data-testid="profile-player-id" aria-label={`ID người chơi ${playerId}`}>
                  {formatPlayerId(playerId)}
                </span>
              </div>
            )}

            <label className="tl-idcard__field">
              <span className="tl-idcard__label">Tên trong game</span>
              <input
                className="tl-input"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                data-testid="profile-name"
              />
            </label>

            <div className="tl-idcard__field">
              <span className="tl-idcard__label">Giới tính</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Giới tính">
                {GENDERS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    role="radio"
                    aria-checked={gender === g.value}
                    onClick={() => setGender(g.value)}
                    className={`tl-seg tl-seg--sm ${gender === g.value ? 'tl-seg--on' : ''}`}
                    data-testid={`gender-${g.value}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tl-idcard__kvs">
              <div className="tl-idcard__kv">
                <span>Số dư hiện tại</span>
                <b title={`${fullNumber(auth.balance)} chip`} data-testid="profile-balance">
                  {formatChip(auth.balance)} chip
                </b>
              </div>
              <div className="tl-idcard__kv">
                <span>Kỷ lục số dư</span>
                <b title={`${fullNumber(highest)} chip`} data-testid="profile-highest">
                  {formatChip(highest)} chip
                </b>
              </div>
            </div>

            <table className="tl-idcard__stats" data-testid="profile-stats">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  {MODES.map((m) => (
                    <th key={m.id}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Số ván đã chơi</th>
                  {MODES.map((m) => (
                    <td key={m.id} data-testid={`played-${m.id}`}>
                      {dash ?? profile.stats?.[m.id]?.played ?? 0}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Số ván thắng</th>
                  {MODES.map((m) => (
                    <td key={m.id} data-testid={`wins-${m.id}`}>
                      {dash ?? profile.stats?.[m.id]?.wins ?? 0}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Tỷ lệ thắng</th>
                  {MODES.map((m) => (
                    <td key={m.id} className="tl-idcard__rate" data-testid={`rate-${m.id}`}>
                      {dash ?? formatRate(winRate(profile.stats?.[m.id]))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="tl-idcard__foot">
          <p className={`tl-idcard__msg ${message ? `tl-idcard__msg--${message.kind}` : ''}`} role="status" data-testid="profile-msg">
            {message?.text || `Hiển thị trong ván là: ${displayNameOf({ display_name: shownName, username: auth.username })}`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="tl-btn tl-btn--ghost" data-testid="profile-close">
              Đóng
            </button>
            <button type="button" onClick={save} disabled={!dirty || saving} className="tl-btn tl-btn--primary" data-testid="profile-save">
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onApply={(dataUrl) => {
            setAvatar(dataUrl);
            setAvatarChanged(true);
            setCropFile(null);
          }}
        />
      )}
    </div>
  );
}
