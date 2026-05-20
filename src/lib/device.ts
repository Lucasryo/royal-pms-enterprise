export const getConnectedMachineName = () => {
  if (typeof window === 'undefined') return 'Terminal PMS';

  try {
    const savedName = window.localStorage.getItem('royal_machine_name')?.trim();
    if (savedName) return savedName;
  } catch (_) {
    return 'Terminal PMS';
  }

  const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  const platformName = platform.toLowerCase().includes('win')
    ? 'Windows'
    : platform.toLowerCase().includes('mac')
      ? 'Mac'
      : platform.toLowerCase().includes('linux')
        ? 'Linux'
        : platform || 'Web';
  const generatedName = `Terminal PMS - ${platformName}`;

  try {
    window.localStorage.setItem('royal_machine_name', generatedName);
  } catch (_) {}

  return generatedName;
};
