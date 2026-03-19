package com.bastyon.chat.plugins.calls

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.telecom.*
import android.util.Log

class CallConnectionService : ConnectionService() {

    companion object {
        private const val TAG = "CallConnectionService"
        var currentConnection: CallConnection? = null

        fun getPhoneAccountHandle(context: Context): PhoneAccountHandle {
            val componentName = ComponentName(context, CallConnectionService::class.java)
            return PhoneAccountHandle(componentName, "BastyonChat")
        }

        fun registerPhoneAccount(context: Context) {
            val handle = getPhoneAccountHandle(context)
            val account = PhoneAccount.builder(handle, "Bastyon Chat")
                .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER)
                .build()
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecomManager.registerPhoneAccount(account)
        }
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        val extras = request?.extras ?: Bundle()
        val callId = extras.getString("callId", "")
        val callerName = extras.getString("callerName", "Unknown")

        Log.d(TAG, "onCreateIncomingConnection: callId=$callId, caller=$callerName")

        val connection = CallConnection(applicationContext, callId)
        connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
        connection.setAddress(
            Uri.fromParts("tel", callerName, null),
            TelecomManager.PRESENTATION_ALLOWED
        )
        connection.setInitializing()
        connection.setRinging()

        currentConnection = connection
        return connection
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ) {
        Log.e(TAG, "onCreateIncomingConnectionFailed")
    }
}

class CallConnection(
    private val context: Context,
    val callId: String
) : Connection() {

    companion object {
        var onAnswered: ((String) -> Unit)? = null
        var onRejected: ((String) -> Unit)? = null
        var onEnded: ((String) -> Unit)? = null
    }

    override fun onAnswer() {
        Log.d("CallConnection", "onAnswer: $callId")
        setActive()
        onAnswered?.invoke(callId)
    }

    override fun onReject() {
        Log.d("CallConnection", "onReject: $callId")
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
        onRejected?.invoke(callId)
    }

    override fun onDisconnect() {
        Log.d("CallConnection", "onDisconnect: $callId")
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
        onEnded?.invoke(callId)
    }
}
