
我们开始进一步定位问题。

我们在是否设置 `"fontDirectory": './fonts/',`和是否传输 data:// 或者 file:// url中间摇摆了很久

```ts diff
  "core": {
    "scriptFile": null,
+    "fontDirectory": null,
 // other setting.core 
  }
```
