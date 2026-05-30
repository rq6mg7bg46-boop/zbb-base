import AsyncStorage from '@react-native-async-storage/async-storage';

async function checkTable() {
  const data = await AsyncStorage.getItem('customer_table');
  if (data) {
    const parsed = JSON.parse(data);
    console.log('========== 客户信息表格 ==========');
    console.log('总计:', parsed.records?.length || 0, '条记录');
    console.log('Next ID:', parsed.nextId);
    console.log('');
    if (parsed.records && parsed.records.length > 0) {
      console.log('| 序号 | 复制时间               | 姓氏 | 性别 | 电话         | 状态     |');
      console.log('|------|----------------------|------|------|--------------|----------|');
      for (const r of parsed.records) {
        console.log('| ' + String(r.id).padEnd(4) + ' | ' + r.copyDateTime.padEnd(20) + ' | ' + r.surname.padEnd(4) + ' | ' + r.gender.padEnd(4) + ' | ' + r.phone.padEnd(12) + ' | ' + r.status.padEnd(8) + ' |');
      }
    } else {
      console.log('(空表格，无数据)');
    }
  } else {
    console.log('表格为空或不存在');
  }
}

checkTable();
