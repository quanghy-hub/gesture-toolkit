Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function New-RoundedRectPath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $diameter = [Math]::Min($Radius * 2, [Math]::Min($Width, $Height))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath

    if ($diameter -le 0) {
        $path.AddRectangle((New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)))
        return $path
    }

    $arc = New-Object System.Drawing.RectangleF($X, $Y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)
    $arc.X = $X + $Width - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Y + $Height - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Icon {
    param(
        [int]$Size,
        [string]$OutputPath
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 128.0

    $backgroundPath = New-RoundedRectPath 3 3 ($Size - 6) ($Size - 6) (30 * $scale)
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($Size, $Size)),
        ([System.Drawing.Color]::FromArgb(255, 10, 35, 96)),
        ([System.Drawing.Color]::FromArgb(255, 38, 96, 255))
    )
    $graphics.FillPath($backgroundBrush, $backgroundPath)

    $glowPath = New-RoundedRectPath (10 * $scale) (10 * $scale) ($Size - 20 * $scale) ($Size - 20 * $scale) (26 * $scale)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(80, 130, 202, 255)
    $glowBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 130, 202, 255))
    $graphics.FillPath($glowBrush, $glowPath)

    $mintPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 112, 255, 219), (10 * $scale))
    $mintPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mintPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $goldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 198, 56), (10 * $scale))
    $goldPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $goldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.DrawBezier(
        $mintPen,
        (58 * $scale), (40 * $scale),
        (42 * $scale), (24 * $scale),
        (20 * $scale), (26 * $scale),
        (18 * $scale), (48 * $scale)
    )
    $graphics.DrawBezier(
        $goldPen,
        (70 * $scale), (38 * $scale),
        (84 * $scale), (24 * $scale),
        (106 * $scale), (26 * $scale),
        (110 * $scale), (48 * $scale)
    )

    $mouseShadowPath = New-RoundedRectPath (42 * $scale) (40 * $scale) (42 * $scale) (58 * $scale) (21 * $scale)
    $shadowMatrix = New-Object System.Drawing.Drawing2D.Matrix
    $shadowMatrix.RotateAt(18, (New-Object System.Drawing.PointF((63 * $scale), (69 * $scale))))
    $mouseShadowPath.Transform($shadowMatrix)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 3, 12, 38))
    $translateMatrix = New-Object System.Drawing.Drawing2D.Matrix
    $translateMatrix.Translate((4 * $scale), (5 * $scale))
    $mouseShadowPath.Transform($translateMatrix)
    $graphics.FillPath($shadowBrush, $mouseShadowPath)

    $mousePath = New-RoundedRectPath (42 * $scale) (40 * $scale) (42 * $scale) (58 * $scale) (21 * $scale)
    $mouseMatrix = New-Object System.Drawing.Drawing2D.Matrix
    $mouseMatrix.RotateAt(18, (New-Object System.Drawing.PointF((63 * $scale), (69 * $scale))))
    $mousePath.Transform($mouseMatrix)
    $mouseBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF((40 * $scale), (36 * $scale))),
        (New-Object System.Drawing.PointF((84 * $scale), (102 * $scale))),
        ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)),
        ([System.Drawing.Color]::FromArgb(255, 235, 241, 255))
    )
    $graphics.FillPath($mouseBrush, $mousePath)

    $mouseOutline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 10, 24, 61), (2.5 * $scale))
    $graphics.DrawPath($mouseOutline, $mousePath)

    $slotPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 21, 50, 110), (3.6 * $scale))
    $slotPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $slotPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($slotPen, (62 * $scale), (48 * $scale), (64 * $scale), (64 * $scale))
    $graphics.DrawLine($slotPen, (46 * $scale), (70 * $scale), (80 * $scale), (70 * $scale))

    $wheelPath = New-RoundedRectPath (58 * $scale) (49 * $scale) (7 * $scale) (16 * $scale) (3.5 * $scale)
    $wheelMatrix = New-Object System.Drawing.Drawing2D.Matrix
    $wheelMatrix.RotateAt(18, (New-Object System.Drawing.PointF((63 * $scale), (57 * $scale))))
    $wheelPath.Transform($wheelMatrix)
    $wheelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 48, 102))
    $graphics.FillPath($wheelBrush, $wheelPath)

    $smallDotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
    $graphics.FillEllipse($smallDotBrush, (24 * $scale), (22 * $scale), (6 * $scale), (6 * $scale))

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $mouseBrush.Dispose()
    $wheelBrush.Dispose()
    $smallDotBrush.Dispose()
    $shadowBrush.Dispose()
    $backgroundBrush.Dispose()
    $glowBrush.Dispose()
    $mintPen.Dispose()
    $goldPen.Dispose()
    $slotPen.Dispose()
    $mouseOutline.Dispose()
    $backgroundPath.Dispose()
    $glowPath.Dispose()
    $mouseShadowPath.Dispose()
    $mousePath.Dispose()
    $wheelPath.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $repoRoot "icons"

$targets = @(
    @{ Size = 16; Name = "icon16.png" },
    @{ Size = 32; Name = "icon32.png" },
    @{ Size = 48; Name = "icon48.png" },
    @{ Size = 128; Name = "icon128.png" }
)

foreach ($target in $targets) {
    Draw-Icon -Size $target.Size -OutputPath (Join-Path $iconDir $target.Name)
}

Write-Host "Generated icons in $iconDir"
