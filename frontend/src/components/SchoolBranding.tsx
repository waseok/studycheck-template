import { useSettings } from '../contexts/SettingsContext'

interface SchoolBrandingProps {
  logoClassName?: string
  titleClassName?: string
  showTitle?: boolean
  layout?: 'horizontal' | 'vertical'
}

const SchoolBranding = ({
  logoClassName = 'h-9 w-9 object-contain',
  titleClassName = '',
  showTitle = true,
  layout = 'horizontal',
}: SchoolBrandingProps) => {
  const { settings, platformLabel } = useSettings()

  const logo = settings.schoolLogoUrl ? (
    <img
      src={settings.schoolLogoUrl}
      alt={`${settings.schoolName} 로고`}
      className={logoClassName}
    />
  ) : (
    <span className={`flex items-center justify-center rounded-full bg-blue-100 text-blue-700 ${logoClassName}`}>
      🏫
    </span>
  )

  if (!showTitle) {
    return logo
  }

  if (layout === 'vertical') {
    return (
      <div className="flex flex-col items-center text-center">
        {logo}
        <div className={titleClassName}>{platformLabel}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {logo}
      <span className={titleClassName}>{platformLabel}</span>
    </div>
  )
}

export default SchoolBranding
