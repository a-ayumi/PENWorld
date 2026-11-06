// 起動の見張り役。main.ts より先に読まれ、起動に失敗したら真っ黒にせず案内を出す
import { watchBoot } from './shell'

watchBoot()
