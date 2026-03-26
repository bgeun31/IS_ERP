interface StatusBadgeProps {
  value: string | null | undefined;
  type?: 'enable' | 'temp' | 'banner' | 'profile' | 'account' | 'power' | 'generic';
}

export default function StatusBadge({ value, type = 'generic' }: StatusBadgeProps) {
  if (value === null || value === undefined || value === '') {
    return <span className="badge badge-gray">-</span>;
  }

  const v = String(value).toLowerCase().trim();

  // enable/disable
  if (type === 'enable' || v === 'enable' || v === 'disable') {
    return <span className={`badge ${v === 'enable' ? 'badge-green' : 'badge-red'}`}>{value}</span>;
  }

  // 온도 상태
  if (type === 'temp') {
    return <span className={`badge ${value === '정상' ? 'badge-green' : 'badge-red'}`}>{value}</span>;
  }

  // 배너
  if (type === 'banner') {
    return <span className={`badge ${value === '있음' ? 'badge-green' : 'badge-red'}`}>{value}</span>;
  }

  // access profile
  if (type === 'profile') {
    return (
      <span className={`badge ${value === 'applied' ? 'badge-green' : 'badge-yellow'}`}>
        {value === 'applied' ? '적용' : '미적용'}
      </span>
    );
  }

  // account
  if (type === 'account') {
    const exists = value === 'true';
    return <span className={`badge ${exists ? 'badge-green' : 'badge-gray'}`}>{exists ? '있음' : '없음'}</span>;
  }

  // power
  if (type === 'power') {
    return <span className={`badge ${v === 'on' ? 'badge-green' : 'badge-red'}`}>{value.toUpperCase()}</span>;
  }

  return <span className="badge badge-gray">{value}</span>;
}
