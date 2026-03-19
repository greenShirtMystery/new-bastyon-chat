package com.bastyon.chat.plugins.calls

import android.content.Intent
import android.os.Bundle
import android.telecom.TelecomManager
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeCall")
class CallPlugin : Plugin() {

    companion object {
        private const val TAG = "CallPlugin"
    }

    override fun load() {
        CallConnectionService.registerPhoneAccount(context)

        CallConnection.onAnswered = { callId ->
            notifyListeners("callAnswered", JSObject().apply {
                put("callId", callId)
            })
        }
        CallConnection.onRejected = { callId ->
            notifyListeners("callDeclined", JSObject().apply {
                put("callId", callId)
            })
        }
        CallConnection.onEnded = { callId ->
            notifyListeners("callEnded", JSObject().apply {
                put("callId", callId)
            })
        }
    }

    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        val callerName = call.getString("callerName") ?: "Unknown"
        val roomId = call.getString("roomId") ?: ""
        val hasVideo = call.getBoolean("hasVideo", false) ?: false

        Log.d(TAG, "reportIncomingCall: $callerName ($callId)")

        try {
            val telecomManager = context.getSystemService(TelecomManager::class.java)
            val handle = CallConnectionService.getPhoneAccountHandle(context)

            val extras = Bundle().apply {
                putString("callId", callId)
                putString("callerName", callerName)
                putString("roomId", roomId)
                putBoolean("hasVideo", hasVideo)
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
            }

            telecomManager.addNewIncomingCall(handle, extras)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report incoming call", e)
            val intent = Intent(context, IncomingCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                putExtra("callId", callId)
                putExtra("callerName", callerName)
            }
            context.startActivity(intent)
            call.resolve()
        }
    }

    @PluginMethod
    fun reportCallEnded(call: PluginCall) {
        CallConnectionService.currentConnection?.onDisconnect()
        CallConnectionService.currentConnection = null
        call.resolve()
    }
}
