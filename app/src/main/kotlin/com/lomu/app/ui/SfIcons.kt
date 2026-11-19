package com.lomu.app.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Glyphs taken as vectors from the Apple Music reference design. Only `house.fill` ships as a vector there;
 * the other tab symbols are SF Symbols text glyphs in that file, so they stay on Material's rounded set.
 */
object SfIcons {
    private const val HOUSE_FILL =
        "M1.608 22.3619C1.94683 22.4808 2.30612 22.5303 2.66449 22.5075L2.66311 22.5089H7.94106V14.4092H7.92865C7.92865 14.1665 8.01415 13.9596 8.17275 13.8134C8.3312 13.6671 8.54052 13.5884 8.75613 13.5941H13.328C13.5707 13.5941 13.7776 13.6672 13.9237 13.8148C14.0699 13.9624 14.143 14.1665 14.143 14.4092V22.5089H19.4086C20.2595 22.5089 20.916 22.2772 21.378 21.8152C21.8524 21.3531 22.0717 20.7077 22.0717 19.894V10.0553C22.0717 9.54499 21.9986 9.09539 21.8276 8.7313C21.6579 8.35342 21.3904 8.01415 21.0139 7.69695L12.5377 0.583374C12.306 0.388916 12.0633 0.241349 11.8206 0.144809C11.5765 0.0482698 11.3089 0 11.0414 0C10.7628 0 10.5062 0.0482698 10.2635 0.144809C10.0208 0.242728 9.7891 0.388916 9.54637 0.583374L1.07159 7.69557C0.693705 8.00036 0.413741 8.36583 0.244107 8.72992C0.0855068 9.09539 0 9.54499 0 10.0442V19.894C0 20.7201 0.231695 21.3531 0.692326 21.8152C0.957771 22.057 1.26918 22.2429 1.608 22.3619Z"

    /** `house.fill`, exactly as drawn in the design kit. */
    val HouseFill: ImageVector by lazy {
        ImageVector.Builder("house.fill", 24.dp, 24.dp, 22.0717f, 22.5129f)
            .addPath(PathParser().parsePathString(HOUSE_FILL).toNodes(), fill = SolidColor(Color.Black))
            .build()
    }
}
