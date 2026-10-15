package com.btspeaker.share

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var hostInput: EditText
    private lateinit var audioCheck: CheckBox
    private lateinit var qualitySpinner: Spinner
    private lateinit var startBtn: Button
    private lateinit var stopBtn: Button
    private lateinit var statusText: TextView

    private val reqProjection = 1001
    private val reqPerms = 1002

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        hostInput = findViewById(R.id.hostInput)
        audioCheck = findViewById(R.id.audioCheck)
        qualitySpinner = findViewById(R.id.qualitySpinner)
        startBtn = findViewById(R.id.startBtn)
        stopBtn = findViewById(R.id.stopBtn)
        statusText = findViewById(R.id.statusText)

        val prefs = getSharedPreferences("share", MODE_PRIVATE)
        hostInput.setText(prefs.getString("host", "http://192.168.1.1:8080"))

        qualitySpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            listOf("Low (faster)", "Medium", "High (sharper)")
        )
        qualitySpinner.setSelection(prefs.getInt("quality", 0))

        if (Build.VERSION.SDK_INT < 29) {
            audioCheck.isChecked = false
            audioCheck.isEnabled = false
            audioCheck.text = "App audio needs Android 10+"
        }

        startBtn.setOnClickListener { ensurePermsThenStart() }
        stopBtn.setOnClickListener { stopShare() }
    }

    private fun ensurePermsThenStart() {
        val need = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            need.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (audioCheck.isChecked &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            need.add(Manifest.permission.RECORD_AUDIO)
        }
        if (need.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, need.toTypedArray(), reqPerms)
            return
        }
        requestProjection()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == reqPerms) requestProjection()
    }

    private fun requestProjection() {
        val host = hostInput.text.toString().trim().trimEnd('/')
        if (!host.startsWith("http://") && !host.startsWith("https://")) {
            Toast.makeText(this, "Enter full URL like http://192.168.x.x:8080", Toast.LENGTH_LONG).show()
            return
        }
        getSharedPreferences("share", MODE_PRIVATE).edit()
            .putString("host", host)
            .putInt("quality", qualitySpinner.selectedItemPosition)
            .apply()

        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpm.createScreenCaptureIntent(), reqProjection)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != reqProjection) return
        if (resultCode != Activity.RESULT_OK || data == null) {
            statusText.text = "Screen capture permission denied"
            return
        }

        val host = hostInput.text.toString().trim().trimEnd('/')
        val quality = qualitySpinner.selectedItemPosition
        val wantAudio = audioCheck.isChecked

        val i = Intent(this, ShareService::class.java).apply {
            action = ShareService.ACTION_START
            putExtra(ShareService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ShareService.EXTRA_DATA, data)
            putExtra(ShareService.EXTRA_HOST, host)
            putExtra(ShareService.EXTRA_QUALITY, quality)
            putExtra(ShareService.EXTRA_AUDIO, wantAudio)
        }
        ContextCompat.startForegroundService(this, i)
        startBtn.isEnabled = false
        stopBtn.isEnabled = true
        statusText.text = "Sharing to $host \u2026\nKeep this app open (or in background with notification)."
    }

    private fun stopShare() {
        val i = Intent(this, ShareService::class.java).apply {
            action = ShareService.ACTION_STOP
        }
        startService(i)
        startBtn.isEnabled = true
        stopBtn.isEnabled = false
        statusText.text = "Stopped"
    }
}
