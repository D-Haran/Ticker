function initialsFor(username = "TRADER") {
  return username
    .split(/[_\s]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfileButton({ profile, onClick }) {
  return (
    <button
      className="player-profile-button"
      type="button"
      onClick={onClick}
      aria-label="Open your profile"
      title="Your profile"
      style={{ "--profile-color": profile.avatarColor }}
    >
      <span>{initialsFor(profile.username)}</span>
      <i />
    </button>
  );
}
