package com.bastyon.chat.plugins.calls

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.LinearLayout
import android.view.Gravity

class IncomingCallActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        val callerName = intent.getStringExtra("callerName") ?: "Unknown"
        val callId = intent.getStringExtra("callId") ?: ""

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }

        val nameText = TextView(this).apply {
            text = callerName
            textSize = 28f
            gravity = Gravity.CENTER
        }

        val statusText = TextView(this).apply {
            text = "Incoming call..."
            textSize = 16f
            gravity = Gravity.CENTER
        }

        val acceptBtn = Button(this).apply {
            text = "Accept"
            setOnClickListener {
                CallConnectionService.currentConnection?.onAnswer()
                finish()
            }
        }

        val declineBtn = Button(this).apply {
            text = "Decline"
            setOnClickListener {
                CallConnectionService.currentConnection?.onReject()
                finish()
            }
        }

        val buttonRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(declineBtn)
            addView(acceptBtn)
        }

        layout.addView(nameText)
        layout.addView(statusText)
        layout.addView(buttonRow)
        setContentView(layout)
    }
}
