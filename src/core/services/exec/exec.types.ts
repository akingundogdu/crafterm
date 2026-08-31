// Fixed-path system binaries — stable /usr locations, no PATH search needed.
export const BIN = {
  lsof: '/usr/sbin/lsof',
  xcrun: '/usr/bin/xcrun',
  security: '/usr/bin/security',
  afplay: '/usr/bin/afplay',
  ps: '/bin/ps',
  vmStat: '/usr/bin/vm_stat',
  sysctl: '/usr/sbin/sysctl'
} as const
