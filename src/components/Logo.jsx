import { useEffect, useState } from 'react';
import { cx } from './UI';

// Gambar logo dengan fallback rapi bila src kosong atau gagal dimuat.
export default function Logo({
  src = '',
  boxClassName = '',
  fallback = '🏪',
  imgClassName = '',
  alt = '',
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const show = !!src && !failed;
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden',
        boxClassName,
        !show && 'text-2xl leading-none'
      )}
    >
      {show ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className={cx('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}